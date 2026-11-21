import {
  calorieTargetHit,
  currentWeight,
  dailyNutrition,
  diffDays,
  eachDay,
  exerciseHistory,
  filterByRange,
  goalProgressPct,
  isValidISODate,
  muscleGroupCounts,
  personalRecords,
  proteinTargetHit,
  startingWeight,
  weeklyBuckets,
  workoutDates,
  workoutTotals,
} from '@forge/shared';
import { Activity, Beef, CalendarCheck, Dumbbell, Flame, Layers, Repeat, Target, Trophy, Weight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDataset, useToday } from '../api/hooks';
import { BarSeriesChart, ChartCard, CHART, LineSeriesChart, RankedBars } from '../components/charts/charts';
import { Input, Select } from '../components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, SectionTitle, Segmented, StatTile } from '../components/ui/primitives';
import { fmtCompact, fmtDate, fmtNum, fmtSigned } from '../lib/format';
import { rangeDates, RANGE_LABELS, type RangeKey } from '../lib/ranges';
import { useUnits } from '../lib/units';

type Key = RangeKey | 'custom';
const RANGES: Key[] = ['30d', '90d', '6m', '1y', 'all', 'custom'];

export function AnalyticsPage() {
  const { data: ds, isLoading, error, refetch } = useDataset();
  const today = useToday();
  const u = useUnits();
  const [range, setRange] = useState<Key>('90d');
  const [custom, setCustom] = useState({ from: '', to: today });
  const [exercise, setExercise] = useState('');

  const earliest = useMemo(() => {
    if (!ds) return null;
    const dates = [...ds.workouts.map((w) => w.date), ...ds.meals.map((m) => m.date), ...ds.bodyMetrics.map((b) => b.date)].sort();
    return dates[0] ?? null;
  }, [ds]);

  const window_ = useMemo(() => {
    if (range === 'custom') {
      const from = isValidISODate(custom.from) ? custom.from : (earliest ?? today);
      const to = isValidISODate(custom.to) ? custom.to : today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    return rangeDates(range, today, earliest);
  }, [range, custom, today, earliest]);

  const view = useMemo(() => {
    if (!ds) return null;
    const { from, to } = window_;
    const s = ds.settings;
    const workouts = filterByRange(ds.workouts, from, to);
    const totals = workouts.map(workoutTotals);
    const days = workoutDates(workouts);
    // Average over the part of the range that has data, so a new user isn't penalised for empty months.
    const firstWorkout = ds.workouts.reduce<string | null>((min, x) => (!min || x.date < min ? x.date : min), null);
    const effectiveFrom = firstWorkout && firstWorkout > from ? firstWorkout : from;
    const weeks = Math.max(1, (diffDays(to, effectiveFrom) + 1) / 7);
    const groups = muscleGroupCounts(workouts);
    const weekly = weeklyBuckets([], from, to).map(({ week }) => ({
      week,
      volume: u.w(workouts.filter((w) => w.date >= week && diffDays(w.date, week) < 7).reduce((sum, w) => sum + workoutTotals(w).volume, 0)),
    }));
    const prs = personalRecords(ds.workouts).filter((p) => p.date >= from && p.date <= to);

    const history = exerciseHistory(ds.workouts);
    const exercises = [...history.entries()]
      .map(([key, sessions]) => ({ key, name: sessions[sessions.length - 1].name, count: sessions.filter((x) => x.date >= from && x.date <= to).length }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count);

    const daily = dailyNutrition(ds.meals);
    const loggedDays = eachDay(from, to).filter((d) => (daily.get(d)?.entries ?? 0) > 0);
    const avg = (k: 'calories' | 'protein' | 'carbohydrates' | 'fats') =>
      loggedDays.length ? loggedDays.reduce((sum, d) => sum + daily.get(d)![k], 0) / loggedDays.length : null;
    const macros = loggedDays.map((d) => ({ date: d, protein: daily.get(d)!.protein, carbs: daily.get(d)!.carbohydrates, fats: daily.get(d)!.fats }));

    const metrics = filterByRange(ds.bodyMetrics, from, to);
    const weights = metrics.filter((m) => m.weight_kg != null).sort((a, b) => a.date.localeCompare(b.date));
    const fat = metrics.filter((m) => m.body_fat_percentage != null).sort((a, b) => a.date.localeCompare(b.date));
    const start = startingWeight(ds.bodyMetrics, s);
    const current = currentWeight(ds.bodyMetrics);

    return {
      s,
      workout: {
        count: days.length,
        perWeek: days.length / weeks,
        topGroup: groups[0]?.group ?? '—',
        sets: totals.reduce((a, t) => a + t.sets, 0),
        reps: totals.reduce((a, t) => a + t.reps, 0),
        volume: totals.reduce((a, t) => a + t.volume, 0),
        groups,
        weekly,
        prs,
      },
      exercises,
      history,
      nutrition: {
        logged: loggedDays.length,
        calories: avg('calories'),
        protein: avg('protein'),
        carbs: avg('carbohydrates'),
        fats: avg('fats'),
        proteinDays: loggedDays.filter((d) => proteinTargetHit(daily.get(d)!, s)).length,
        calorieDays: loggedDays.filter((d) => calorieTargetHit(daily.get(d)!, s)).length,
        macros,
      },
      body: {
        weights: weights.map((m) => ({ date: m.date, weight: u.w(m.weight_kg) })),
        fat: fat.map((m) => ({ date: m.date, fat: m.body_fat_percentage })),
        rangeChange: weights.length > 1 ? weights[weights.length - 1].weight_kg! - weights[0].weight_kg! : null,
        fatChange: fat.length > 1 ? fat[fat.length - 1].body_fat_percentage! - fat[0].body_fat_percentage! : null,
        progress: goalProgressPct(start, current, s.target_weight_kg),
      },
    };
  }, [ds, window_, u]);

  useEffect(() => {
    if (view && (!exercise || !view.exercises.some((e) => e.key === exercise))) setExercise(view.exercises[0]?.key ?? '');
  }, [view, exercise]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !view) return <PageSkeleton />;

  const sessions = (view.history.get(exercise) ?? []).filter((x) => x.date >= window_.from && x.date <= window_.to);
  const bodyweight = sessions.length > 0 && sessions.every((x) => x.bodyweight);
  const progression = sessions.map((x) => ({ date: x.date, top: bodyweight ? x.maxReps : u.w(x.topWeight), e1rm: u.w(x.est1RM) }));
  const { workout: w, nutrition: n, body: b } = view;

  return (
    <div>
      <PageHeader title="Progress & Analytics" description={`${fmtDate(window_.from)} – ${fmtDate(window_.to)} · calculated live from your CSV data`} />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented label="Analytics range" size="md" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r === 'custom' ? 'Custom' : RANGE_LABELS[r] }))} />
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From date" className="h-9 w-auto" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span className="text-ink-3">–</span>
            <Input type="date" aria-label="To date" className="h-9 w-auto" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- Workouts */}
      <SectionTitle>Workouts</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Workouts" icon={Dumbbell} value={w.count} />
        <StatTile label="Per week" icon={CalendarCheck} value={fmtNum(w.perWeek, 1)} hint={`target ${view.s.weekly_workout_target}`} />
        <StatTile label="Top muscle group" icon={Target} value={<span className="text-lg">{w.topGroup}</span>} />
        <StatTile label="Sets" icon={Layers} value={fmtNum(w.sets)} />
        <StatTile label="Reps" icon={Repeat} value={fmtCompact(w.reps)} />
        <StatTile label="Volume" icon={Weight} value={fmtCompact(u.w(w.volume))} unit={u.weight} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <ChartCard
          title="Weekly volume"
          subtitle={`Sets × reps × weight, ${u.weight}`}
          empty={!w.count && <EmptyState compact icon={Dumbbell} title="No workouts in this range" />}
          table={{ columns: ['Week of', u.weight], rows: w.weekly.map((r) => [fmtDate(r.week), fmtNum(r.volume)]) }}
        >
          <BarSeriesChart data={w.weekly} xKey="week" series={{ key: 'volume', label: 'Volume', color: CHART.brand }} unit={u.weight} xFormatter={fmtDate} tooltipLabel={(d) => `Week of ${fmtDate(d)}`} />
        </ChartCard>
        <Card title="Muscle groups" subtitle="Workouts that trained each group">
          {w.groups.length ? <RankedBars rows={w.groups.slice(0, 8).map((g) => ({ label: g.group, value: g.count }))} unit="workouts" /> : <EmptyState compact icon={Target} title="No muscle groups yet" />}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <ChartCard
          title="Exercise progression"
          subtitle={bodyweight ? 'Best set reps per session' : `Top set and estimated 1RM, ${u.weight}`}
          legend={bodyweight ? undefined : [{ key: 'top', label: 'Top set', color: CHART.brand }, { key: 'e1rm', label: 'Est. 1RM', color: CHART.electric }]}
          action={
            view.exercises.length > 0 && (
              <Select aria-label="Exercise" className="h-8 w-44 text-[13px]" value={exercise} onChange={(e) => setExercise(e.target.value)}>
                {view.exercises.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )
          }
          empty={!progression.length && <EmptyState compact icon={Activity} title="No exercise sessions in this range" />}
          table={{ columns: ['Date', bodyweight ? 'Reps' : `Top (${u.weight})`, ...(bodyweight ? [] : ['Est. 1RM'])], rows: progression.map((p) => [fmtDate(p.date), fmtNum(p.top, 1), ...(bodyweight ? [] : [fmtNum(p.e1rm, 1)])]) }}
        >
          <LineSeriesChart
            data={progression}
            xKey="date"
            series={bodyweight ? [{ key: 'top', label: 'Best set', color: CHART.brand }] : [{ key: 'top', label: 'Top set', color: CHART.brand }, { key: 'e1rm', label: 'Est. 1RM', color: CHART.electric }]}
            unit={bodyweight ? 'reps' : u.weight}
            xFormatter={fmtDate}
            domainPadding={bodyweight ? 1 : 2}
          />
        </ChartCard>
        <Card title="Personal records" subtitle={`${w.prs.length} in this range`}>
          {w.prs.length ? (
            <ul className="scrollbar-thin max-h-60 space-y-2 overflow-y-auto pr-1">
              {[...w.prs].reverse().map((p) => (
                <li key={`${p.exercise_id}-${p.kind}`} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.exercise}</span>
                    <span className="text-xs text-ink-3">{fmtDate(p.date)}</span>
                  </span>
                  <Badge tone="brand" icon={Trophy}>
                    {p.kind === 'weight' ? `${fmtNum(u.w(p.value), 1)} ${u.weight}` : `${p.value} reps`}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Trophy} title="No PRs in this range" description="Beat your best weight (or reps for bodyweight moves) to set one." />
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------- Nutrition */}
      <SectionTitle>Nutrition</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Avg calories" icon={Flame} value={fmtNum(n.calories)} unit="kcal" hint={`${n.logged} days logged`} />
        <StatTile label="Avg protein" icon={Beef} value={fmtNum(n.protein)} unit="g" />
        <StatTile label="Avg carbs" value={fmtNum(n.carbs)} unit="g" />
        <StatTile label="Avg fats" value={fmtNum(n.fats)} unit="g" />
        <StatTile label="Protein target hit" icon={Target} value={n.proteinDays} unit={`/ ${n.logged} days`} />
        <StatTile label="Calories on target" icon={Target} value={n.calorieDays} unit={`/ ${n.logged} days`} hint="within ±10%" />
      </div>
      <div className="mt-4">
        <ChartCard
          title="Daily macros"
          subtitle="Grams per logged day"
          legend={[
            { key: 'protein', label: 'Protein', color: CHART.protein },
            { key: 'carbs', label: 'Carbohydrates', color: CHART.carbs },
            { key: 'fats', label: 'Fats', color: CHART.fats },
          ]}
          empty={!n.macros.length && <EmptyState compact icon={Flame} title="No meals logged in this range" />}
          table={{ columns: ['Date', 'Protein', 'Carbs', 'Fats'], rows: n.macros.map((m) => [fmtDate(m.date), fmtNum(m.protein), fmtNum(m.carbs), fmtNum(m.fats)]) }}
        >
          <LineSeriesChart
            data={n.macros}
            xKey="date"
            series={[
              { key: 'protein', label: 'Protein', color: CHART.protein },
              { key: 'carbs', label: 'Carbohydrates', color: CHART.carbs },
              { key: 'fats', label: 'Fats', color: CHART.fats },
            ]}
            unit="g"
            dp={0}
            domainPadding={10}
            xFormatter={fmtDate}
          />
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------- Body */}
      <SectionTitle>Body</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Weight change" value={b.rangeChange == null ? '—' : fmtSigned(u.w(b.rangeChange), 1)} unit={b.rangeChange == null ? undefined : u.weight} hint="in this range" />
        <StatTile label="Body fat change" value={b.fatChange == null ? '—' : fmtSigned(b.fatChange, 1)} unit={b.fatChange == null ? undefined : 'pts'} hint="in this range" />
        <StatTile label="Target progress" value={b.progress == null ? '—' : fmtNum(b.progress)} unit={b.progress == null ? undefined : '%'} hint={b.progress == null ? 'set a target weight' : 'start → target'} />
        <StatTile label="Weigh-ins" value={b.weights.length} hint="in this range" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Weight progression"
          subtitle={u.weight}
          empty={!b.weights.length && <EmptyState compact icon={Weight} title="No weigh-ins in this range" />}
          table={{ columns: ['Date', u.weight], rows: b.weights.map((r) => [fmtDate(r.date), fmtNum(r.weight, 1)]) }}
        >
          <LineSeriesChart data={b.weights} xKey="date" series={[{ key: 'weight', label: 'Weight', color: CHART.electric }]} unit={u.weight} target={u.w(view.s.target_weight_kg)} xFormatter={fmtDate} />
        </ChartCard>
        <ChartCard
          title="Body fat progression"
          subtitle="Percent"
          empty={!b.fat.length && <EmptyState compact icon={Activity} title="No body fat readings in this range" />}
          table={{ columns: ['Date', '%'], rows: b.fat.map((r) => [fmtDate(r.date), fmtNum(r.fat, 1)]) }}
        >
          <LineSeriesChart data={b.fat} xKey="date" series={[{ key: 'fat', label: 'Body fat', color: CHART.fats }]} unit="%" xFormatter={fmtDate} />
        </ChartCard>
      </div>
    </div>
  );
}
