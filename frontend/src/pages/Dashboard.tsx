import {
  addDays,
  currentWeight,
  dailyNutrition,
  eachDay,
  emptyTotals,
  endOfWeek,
  startOfWeek,
  weeklyBuckets,
  weightEntries,
  workoutDates,
  workoutTotals,
} from '@forge/shared';
import { CheckCircle2, Circle, Dumbbell, Flame, Layers, Plus, Scale, Timer, TrendingDown, TrendingUp, UtensilsCrossed, Weight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDataset, useToday } from '../api/hooks';
import { BarSeriesChart, ChartCard, CHART, LineSeriesChart } from '../components/charts/charts';
import { MacroBar } from '../features/nutrition/MacroBar';
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, ProgressRing, Segmented, SectionTitle, StatTile } from '../components/ui/primitives';
import { fmtCompact, fmtDate, fmtDuration, fmtNum, fmtSigned, fmtWeekday } from '../lib/format';
import { rangeDates, RANGE_LABELS, type RangeKey } from '../lib/ranges';
import { useUnits } from '../lib/units';

const RANGES: RangeKey[] = ['7d', '30d', '90d'];

export function DashboardPage() {
  const { data: ds, isLoading, error, refetch } = useDataset();
  const today = useToday();
  const units = useUnits();
  const [range, setRange] = useState<RangeKey>('30d');

  const view = useMemo(() => {
    if (!ds) return null;
    const s = ds.settings;
    const daily = dailyNutrition(ds.meals);
    const todayTotals = daily.get(today) ?? emptyTotals();
    const todaysWorkouts = ds.workouts.filter((w) => w.date === today);

    const weekFrom = startOfWeek(today);
    const weekTo = endOfWeek(today);
    const weekWorkouts = ds.workouts.filter((w) => w.date >= weekFrom && w.date <= today);
    const wt = weekWorkouts.map(workoutTotals);
    const loggedDays = eachDay(weekFrom, today).filter((d) => (daily.get(d)?.entries ?? 0) > 0);
    const avg = (f: (d: string) => number) => (loggedDays.length ? loggedDays.reduce((sum, d) => sum + f(d), 0) / loggedDays.length : null);
    const weight = currentWeight(ds.bodyMetrics);
    const weekAgo = currentWeight(ds.bodyMetrics, addDays(today, -7));
    const weekChange = weight != null && weekAgo != null ? weight - weekAgo : null;

    const { from, to } = rangeDates(range, today);
    const days = eachDay(from, to);
    const calories = days.map((d) => ({ date: d, calories: daily.get(d)?.calories ?? null }));
    const protein = days.map((d) => ({ date: d, protein: daily.get(d)?.protein ?? null }));
    const weights = weightEntries(ds.bodyMetrics)
      .filter((m) => m.date >= from && m.date <= to)
      .map((m) => ({ date: m.date, weight: units.w(m.weight_kg) }));
    const frequency = weeklyBuckets(workoutDates(ds.workouts, from, to), from, to);

    return {
      s,
      todayTotals,
      todaysWorkouts,
      weekFrom,
      weekTo,
      week: {
        workouts: new Set(weekWorkouts.map((w) => w.date)).size,
        duration: weekWorkouts.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0),
        sets: wt.reduce((sum, t) => sum + t.sets, 0),
        volume: wt.reduce((sum, t) => sum + t.volume, 0),
        avgCalories: avg((d) => daily.get(d)!.calories),
        avgProtein: avg((d) => daily.get(d)!.protein),
        weekChange,
      },
      weight,
      charts: { calories, protein, weights, frequency, hasNutrition: calories.some((c) => c.calories != null) },
    };
  }, [ds, today, range, units]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !view) return <PageSkeleton />;

  const { s, todayTotals: t, week } = view;
  const remaining = s.calorie_target - t.calories;
  const short = (d: string) => (range === '7d' ? fmtWeekday(d) : fmtDate(d));

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${s.display_name || 'Athlete'}`}
        description="Today’s fuel, training and body data, straight from your CSV files."
      />

      {/* ---------------------------------------------------------- Today */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Today’s nutrition" className="lg:col-span-7" action={<Link to="/nutrition" className="text-[13px] font-medium text-brand hover:underline">Log food</Link>}>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <ProgressRing value={t.calories} max={s.calorie_target} label={`${fmtNum(t.calories)} of ${fmtNum(s.calorie_target)} calories`}>
              <span className="text-2xl font-semibold tracking-tight tabular">{fmtNum(t.calories)}</span>
              <span className="text-xs text-ink-3">of {fmtNum(s.calorie_target)} kcal</span>
            </ProgressRing>
            <div className="w-full min-w-0 flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-line bg-bg px-3 py-2">
                  <p className="text-xs text-ink-3">{remaining >= 0 ? 'Remaining' : 'Over target'}</p>
                  <p className="text-lg font-semibold tabular">
                    {fmtNum(Math.abs(remaining))} <span className="text-xs font-normal text-ink-3">kcal</span>
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg px-3 py-2">
                  <p className="text-xs text-ink-3">Food entries</p>
                  <p className="text-lg font-semibold tabular">{t.entries}</p>
                </div>
              </div>
              <MacroBar label="Protein" value={t.protein} target={s.protein_target_g} color={CHART.protein} />
              <MacroBar label="Carbohydrates" value={t.carbohydrates} target={s.carbs_target_g} color={CHART.carbs} />
              <MacroBar label="Fats" value={t.fats} target={s.fat_target_g} color={CHART.fats} />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
          <Card title="Today’s workout">
            {view.todaysWorkouts.length ? (
              <div className="space-y-2">
                {view.todaysWorkouts.map((w) => {
                  const tt = workoutTotals(w);
                  return (
                    <div key={w.workout_id} className="flex items-center gap-3">
                      <CheckCircle2 className="size-5 shrink-0 text-good" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{w.workout_name}</p>
                        <p className="text-xs text-ink-3 tabular">
                          {fmtDuration(w.duration_minutes)} · {tt.sets} sets · {fmtCompact(units.w(tt.volume))} {units.weight}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Circle className="size-5 text-ink-3" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">Pending</p>
                    <p className="text-xs text-ink-3">Rest days count too — recovery builds strength.</p>
                  </div>
                </div>
                <Link to="/workouts?new=1" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-[#160a03] hover:bg-brand-hover">
                  <Plus className="size-4" aria-hidden /> Log
                </Link>
              </div>
            )}
          </Card>
          <Card title="Body weight" action={<Link to="/body" className="text-[13px] font-medium text-brand hover:underline">Log</Link>}>
            <p className="flex items-baseline gap-1 tabular">
              <span className="text-2xl font-semibold tracking-tight">{view.weight == null ? '—' : fmtNum(units.w(view.weight), 1)}</span>
              <span className="text-[13px] text-ink-3">{units.weight}</span>
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {s.target_weight_kg != null ? `Target ${units.fmtW(s.target_weight_kg)}` : 'Set a target weight in Settings'}
            </p>
          </Card>
        </div>
      </div>

      {/* ---------------------------------------------------------- Week */}
      <SectionTitle>
        This week · {fmtDate(view.weekFrom)} – {fmtDate(view.weekTo)}
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Workouts" icon={Dumbbell} value={week.workouts} unit={`/ ${s.weekly_workout_target}`} hint="training days" />
        <StatTile label="Duration" icon={Timer} value={fmtDuration(week.duration)} />
        <StatTile label="Sets" icon={Layers} value={fmtNum(week.sets)} />
        <StatTile label="Volume" icon={Weight} value={fmtCompact(units.w(week.volume))} unit={units.weight} />
        <StatTile label="Avg calories" icon={Flame} value={fmtNum(week.avgCalories)} unit="kcal/day" />
        <StatTile label="Avg protein" icon={UtensilsCrossed} value={fmtNum(week.avgProtein)} unit="g/day" />
        <StatTile
          label="Weight change"
          icon={week.weekChange != null && week.weekChange < 0 ? TrendingDown : TrendingUp}
          value={week.weekChange == null ? '—' : fmtSigned(units.w(week.weekChange), 1)}
          unit={week.weekChange == null ? undefined : units.weight}
          hint="vs 7 days ago"
        />
      </div>

      {/* ---------------------------------------------------------- Charts */}
      <SectionTitle
        action={
          <Segmented label="Chart range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))} />
        }
      >
        Trends
      </SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Calories"
          subtitle={`Daily intake vs ${fmtNum(s.calorie_target)} kcal target`}
          empty={!view.charts.hasNutrition && <EmptyState compact icon={UtensilsCrossed} title="No meals logged in this range" />}
          table={{ columns: ['Date', 'kcal'], rows: view.charts.calories.filter((c) => c.calories != null).map((c) => [fmtDate(c.date), fmtNum(c.calories)]) }}
        >
          <BarSeriesChart data={view.charts.calories} xKey="date" series={{ key: 'calories', label: 'Calories', color: CHART.brand }} unit="kcal" target={s.calorie_target} xFormatter={short} tooltipLabel={fmtDate} />
        </ChartCard>
        <ChartCard
          title="Protein"
          subtitle={`Daily grams vs ${fmtNum(s.protein_target_g)} g target`}
          empty={!view.charts.hasNutrition && <EmptyState compact icon={UtensilsCrossed} title="No meals logged in this range" />}
          table={{ columns: ['Date', 'Protein (g)'], rows: view.charts.protein.filter((c) => c.protein != null).map((c) => [fmtDate(c.date), fmtNum(c.protein)]) }}
        >
          <BarSeriesChart data={view.charts.protein} xKey="date" series={{ key: 'protein', label: 'Protein', color: CHART.protein }} unit="g" target={s.protein_target_g} xFormatter={short} tooltipLabel={fmtDate} />
        </ChartCard>
        <ChartCard
          title="Body weight"
          subtitle={`Logged weigh-ins, ${units.weight}`}
          empty={view.charts.weights.length < 1 && <EmptyState compact icon={Scale} title="No weigh-ins in this range" description="Log your weight on the Body Metrics page." />}
          table={{ columns: ['Date', units.weight], rows: view.charts.weights.map((w) => [fmtDate(w.date), fmtNum(w.weight, 1)]) }}
        >
          <LineSeriesChart
            data={view.charts.weights}
            xKey="date"
            series={[{ key: 'weight', label: 'Weight', color: CHART.electric }]}
            unit={units.weight}
            xFormatter={fmtDate}
          />
        </ChartCard>
        <ChartCard
          title="Workout frequency"
          subtitle={`Training days per week · target ${s.weekly_workout_target}`}
          table={{ columns: ['Week of', 'Training days'], rows: view.charts.frequency.map((f) => [fmtDate(f.week), f.count]) }}
        >
          <BarSeriesChart
            data={view.charts.frequency}
            xKey="week"
            series={{ key: 'count', label: 'Training days', color: CHART.brand }}
            unit="days"
            target={s.weekly_workout_target}
            xFormatter={fmtDate}
            tooltipLabel={(d) => `Week of ${fmtDate(d)}`}
          />
        </ChartCard>
      </div>
    </div>
  );
}
