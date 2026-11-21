import { addDays, isSampleId, MEAL_LABELS, MEAL_TYPES, sumNutrition, type MealEntry, type MealType } from '@forge/shared';
import { ChevronLeft, ChevronRight, Pencil, Plus, Settings2, Trash2, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { keys, useDataset, useForgeMutation, useToday } from '../api/hooks';
import { CHART } from '../components/charts/charts';
import { Input } from '../components/ui/form';
import { ConfirmDialog } from '../components/ui/overlay';
import { Button, Card, ErrorState, IconButton, PageHeader, PageSkeleton, ProgressRing, SampleBadge } from '../components/ui/primitives';
import { FoodModal } from '../features/nutrition/FoodModal';
import { MacroBar } from '../features/nutrition/MacroBar';
import { fmtDateLong, fmtNum, fmtQuantity } from '../lib/format';

export function NutritionPage() {
  const { data: ds, isLoading, error, refetch } = useDataset();
  const today = useToday();
  const [date, setDate] = useState(today);
  const [modal, setModal] = useState<{ entry: MealEntry | null; mealType: MealType } | null>(null);
  const [deleting, setDeleting] = useState<MealEntry | null>(null);

  const remove = useForgeMutation((id: string) => api.send('DELETE', `/meals/${id}`), { invalidate: [keys.meals], success: 'Food entry deleted' });

  const day = useMemo(() => {
    if (!ds) return null;
    const entries = ds.meals.filter((m) => m.date === date);
    const byMeal = new Map<MealType, MealEntry[]>(MEAL_TYPES.map((t) => [t, []]));
    for (const e of entries) byMeal.get(MEAL_TYPES.includes(e.meal_type) ? e.meal_type : 'other')!.push(e);
    return { totals: sumNutrition(entries), byMeal };
  }, [ds, date]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !ds || !day) return <PageSkeleton />;
  const s = ds.settings;
  const t = day.totals;
  const remaining = s.calorie_target - t.calories;

  return (
    <div>
      <PageHeader
        title="Nutrition"
        description="Log food by meal. Totals are calculated from meals.csv."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setModal({ entry: null, mealType: 'other' })}>
            Add food
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton icon={ChevronLeft} label="Previous day" onClick={() => setDate(addDays(date, -1))} />
        <Input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
        <IconButton icon={ChevronRight} label="Next day" onClick={() => setDate(addDays(date, 1))} />
        {date !== today && (
          <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
            Jump to today
          </Button>
        )}
        <p className="ml-1 text-[13px] text-ink-3">{fmtDateLong(date)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card
            title="Daily totals"
            action={
              <Link to="/settings#targets" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
                <Settings2 className="size-3.5" aria-hidden /> Targets
              </Link>
            }
          >
            <div className="flex flex-col items-center gap-5">
              <ProgressRing value={t.calories} max={s.calorie_target} size={164} label={`${fmtNum(t.calories)} of ${fmtNum(s.calorie_target)} calories`}>
                <span className="text-2xl font-semibold tracking-tight tabular">{fmtNum(t.calories)}</span>
                <span className="text-xs text-ink-3">of {fmtNum(s.calorie_target)} kcal</span>
                <span className={`mt-1 text-[11px] font-medium ${remaining >= 0 ? 'text-ink-2' : 'text-warn'}`}>
                  {remaining >= 0 ? `${fmtNum(remaining)} left` : `${fmtNum(-remaining)} over`}
                </span>
              </ProgressRing>
              <div className="w-full space-y-4">
                <MacroBar label="Protein" value={t.protein} target={s.protein_target_g} color={CHART.protein} />
                <MacroBar label="Carbohydrates" value={t.carbohydrates} target={s.carbs_target_g} color={CHART.carbs} />
                <MacroBar label="Fats" value={t.fats} target={s.fat_target_g} color={CHART.fats} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          {MEAL_TYPES.map((type) => {
            const items = day.byMeal.get(type)!;
            const st = sumNutrition(items);
            return (
              <section key={type} className="rounded-[var(--radius-card)] border border-line bg-surface" aria-label={MEAL_LABELS[type]}>
                <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
                  <div>
                    <h2 className="text-sm font-semibold">{MEAL_LABELS[type]}</h2>
                    <p className="text-xs text-ink-3 tabular">
                      {items.length ? (
                        <>
                          {fmtNum(st.calories)} kcal · P {fmtNum(st.protein)}g · C {fmtNum(st.carbohydrates)}g · F {fmtNum(st.fats)}g
                        </>
                      ) : (
                        'Nothing logged'
                      )}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => setModal({ entry: null, mealType: type })}>
                    Add to {MEAL_LABELS[type].toLowerCase()}
                  </Button>
                </header>
                {items.length > 0 && (
                  <ul className="border-t border-line">
                    {items.map((m) => (
                      <li key={m.meal_id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate text-[13px] font-medium">
                            <span className="truncate">{m.food_name}</span>
                            {isSampleId(m.meal_id) && <SampleBadge />}
                          </p>
                          <p className="text-xs text-ink-3 tabular">
                            {m.quantity != null && `${fmtQuantity(m.quantity, m.quantity_unit)} · `}P {fmtNum(m.protein, 1)} · C {fmtNum(m.carbohydrates, 1)} · F {fmtNum(m.fats, 1)}
                          </p>
                        </div>
                        <p className="shrink-0 text-[13px] font-medium tabular">
                          {fmtNum(m.calories)} <span className="text-xs font-normal text-ink-3">kcal</span>
                        </p>
                        <div className="flex shrink-0">
                          <IconButton size="sm" icon={Pencil} label={`Edit ${m.food_name}`} onClick={() => setModal({ entry: m, mealType: m.meal_type })} />
                          <IconButton size="sm" icon={Trash2} tone="danger" label={`Delete ${m.food_name}`} onClick={() => setDeleting(m)} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {t.entries === 0 && (
            <p className="flex items-center justify-center gap-2 py-2 text-[13px] text-ink-3">
              <UtensilsCrossed className="size-4" aria-hidden /> No food logged for this day yet.
            </p>
          )}
        </div>
      </div>

      <FoodModal open={!!modal} onClose={() => setModal(null)} entry={modal?.entry ?? null} mealType={modal?.mealType ?? 'other'} date={date} history={ds.meals} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.meal_id).catch(() => undefined);
          setDeleting(null);
        }}
        title="Delete food entry?"
        body={
          deleting && (
            <>
              <strong className="text-ink">{deleting.food_name}</strong> ({fmtNum(deleting.calories)} kcal) will be removed from {MEAL_LABELS[deleting.meal_type]}. A backup is saved first.
            </>
          )
        }
        confirmLabel="Delete entry"
      />
    </div>
  );
}
