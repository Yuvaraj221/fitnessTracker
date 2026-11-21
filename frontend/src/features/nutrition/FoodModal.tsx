import { MEAL_LABELS, MEAL_TYPES, type MealEntry, type MealType } from '@forge/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { keys, useForgeMutation } from '../../api/hooks';
import { Field, Input, NumberInput, numStr, parseNum, Select, Textarea } from '../../components/ui/form';
import { Modal } from '../../components/ui/overlay';
import { Button } from '../../components/ui/primitives';
import { fmtNum } from '../../lib/format';

const UNITS = ['g', 'ml', 'pieces', 'servings', 'slices', 'scoop', 'cup', 'tbsp', 'tsp', 'oz'];

interface Draft {
  meal_type: MealType;
  food_name: string;
  quantity: string;
  quantity_unit: string;
  calories: string;
  protein: string;
  carbohydrates: string;
  fats: string;
  notes: string;
}

const fromEntry = (e: MealEntry | null, mealType: MealType): Draft => ({
  meal_type: e?.meal_type ?? mealType,
  food_name: e?.food_name ?? '',
  quantity: numStr(e?.quantity),
  quantity_unit: e?.quantity_unit || 'g',
  calories: numStr(e?.calories, 1),
  protein: numStr(e?.protein, 1),
  carbohydrates: numStr(e?.carbohydrates, 1),
  fats: numStr(e?.fats, 1),
  notes: e?.notes ?? '',
});

type Errors = Partial<Record<keyof Draft, string>>;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.food_name.trim()) e.food_name = 'Name the food, e.g. “Greek yogurt”';
  const cal = parseNum(d.calories);
  if (cal == null) e.calories = 'Enter calories (0 is fine)';
  for (const key of ['quantity', 'calories', 'protein', 'carbohydrates', 'fats'] as const) {
    const n = parseNum(d[key]);
    if (n != null && (Number.isNaN(n) || n < 0)) e[key] = 'Use a number ≥ 0';
  }
  return e;
}

export function FoodModal({
  open,
  onClose,
  entry,
  date,
  mealType,
  history,
}: {
  open: boolean;
  onClose: () => void;
  entry: MealEntry | null;
  date: string;
  mealType: MealType;
  history: MealEntry[];
}) {
  const [draft, setDraft] = useState<Draft>(() => fromEntry(entry, mealType));
  const [touched, setTouched] = useState<Partial<Record<keyof Draft, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(fromEntry(entry, mealType));
      setTouched({});
      setSubmitted(false);
    }
  }, [open, entry, mealType]);

  /** Most recent entry per food name — powers autocomplete + autofill. */
  const recentFoods = useMemo(() => {
    const map = new Map<string, MealEntry>();
    for (const m of [...history].sort((a, b) => b.date.localeCompare(a.date))) {
      const key = m.food_name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, m);
    }
    return map;
  }, [history]);

  const allErrors = validate(draft);
  const err = (k: keyof Draft) => (submitted || touched[k] ? allErrors[k] : undefined);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const blur = (k: keyof Draft) => () => setTouched((t) => ({ ...t, [k]: true }));

  const autofill = () => {
    if (entry) return;
    const known = recentFoods.get(draft.food_name.trim().toLowerCase());
    if (!known || draft.calories) return;
    set({
      quantity: numStr(known.quantity),
      quantity_unit: known.quantity_unit || draft.quantity_unit,
      calories: numStr(known.calories, 1),
      protein: numStr(known.protein, 1),
      carbohydrates: numStr(known.carbohydrates, 1),
      fats: numStr(known.fats, 1),
    });
  };

  const save = useForgeMutation(
    (body: Omit<MealEntry, 'meal_id'>) => (entry ? api.send<MealEntry>('PUT', `/meals/${entry.meal_id}`, body) : api.send<MealEntry>('POST', '/meals', body)),
    { invalidate: [keys.meals], success: (m: MealEntry) => (entry ? `Updated ${m.food_name}` : `Added ${m.food_name} to ${MEAL_LABELS[m.meal_type]}`) },
  );

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.keys(allErrors).length) return;
    await save.mutateAsync({
      date: entry?.date ?? date,
      meal_type: draft.meal_type,
      food_name: draft.food_name.trim(),
      quantity: parseNum(draft.quantity),
      quantity_unit: draft.quantity_unit,
      calories: parseNum(draft.calories) ?? 0,
      protein: parseNum(draft.protein) ?? 0,
      carbohydrates: parseNum(draft.carbohydrates) ?? 0,
      fats: parseNum(draft.fats) ?? 0,
      notes: draft.notes.trim(),
    });
    onClose();
  };

  const p = parseNum(draft.protein) || 0;
  const c = parseNum(draft.carbohydrates) || 0;
  const f = parseNum(draft.fats) || 0;
  const macroKcal = p * 4 + c * 4 + f * 9;
  const kcal = parseNum(draft.calories) || 0;
  const mismatch = macroKcal > 0 && kcal > 0 && Math.abs(macroKcal - kcal) / kcal > 0.2;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit food' : 'Add food'}
      description="Enter values for the quantity you ate."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => submit()} loading={save.isPending}>
            {entry ? 'Save changes' : 'Add food'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <datalist id="recent-foods">
          {[...recentFoods.values()].map((m) => (
            <option key={m.meal_id} value={m.food_name} />
          ))}
        </datalist>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_170px]">
          <Field label="Food" error={err('food_name')} hint={!entry ? 'Pick a food you’ve logged before to reuse its values.' : undefined}>
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                list="recent-foods"
                invalid={!!err('food_name')}
                value={draft.food_name}
                onChange={(e) => set({ food_name: e.target.value })}
                onBlur={() => {
                  blur('food_name')();
                  autofill();
                }}
                placeholder="e.g. Chicken breast"
                data-autofocus
              />
            )}
          </Field>
          <Field label="Meal">
            {(id) => (
              <Select id={id} value={draft.meal_type} onChange={(e) => set({ meal_type: e.target.value as MealType })}>
                {MEAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MEAL_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity" optional error={err('quantity')}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} invalid={!!err('quantity')} value={draft.quantity} onChange={(e) => set({ quantity: e.target.value })} onBlur={blur('quantity')} />}
          </Field>
          <Field label="Unit">
            {(id) => (
              <Select id={id} value={draft.quantity_unit} onChange={(e) => set({ quantity_unit: e.target.value })}>
                {(UNITS.includes(draft.quantity_unit) ? UNITS : [draft.quantity_unit, ...UNITS]).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Calories" error={err('calories')}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} invalid={!!err('calories')} suffix="kcal" value={draft.calories} onChange={(e) => set({ calories: e.target.value })} onBlur={blur('calories')} />}
          </Field>
          <Field label="Protein" error={err('protein')}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} invalid={!!err('protein')} suffix="g" value={draft.protein} onChange={(e) => set({ protein: e.target.value })} onBlur={blur('protein')} placeholder="0" />}
          </Field>
          <Field label="Carbs" error={err('carbohydrates')}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} invalid={!!err('carbohydrates')} suffix="g" value={draft.carbohydrates} onChange={(e) => set({ carbohydrates: e.target.value })} onBlur={blur('carbohydrates')} placeholder="0" />}
          </Field>
          <Field label="Fats" error={err('fats')}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} invalid={!!err('fats')} suffix="g" value={draft.fats} onChange={(e) => set({ fats: e.target.value })} onBlur={blur('fats')} placeholder="0" />}
          </Field>
        </div>
        {mismatch && (
          <p className="text-xs text-ink-3">
            Heads-up: these macros add up to about {fmtNum(macroKcal)} kcal. Double-check the calories if that looks off.
          </p>
        )}
        <Field label="Notes" optional>
          {(id) => <Textarea id={id} className="min-h-16" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
