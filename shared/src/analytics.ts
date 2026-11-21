// Pure analytics functions. Every chart, stat and achievement in FORGE is
// derived from CSV data through these helpers — nothing is hardcoded.

import { addDays, diffDays, inRange, startOfWeek } from './dates';
import type {
  BodyMetric,
  Dataset,
  ExerciseWithSets,
  ISODate,
  MealEntry,
  Settings,
  WorkoutWithExercises,
} from './types';

export const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// ---------------------------------------------------------------- workouts

export const splitGroups = (s: string): string[] =>
  s
    .split('|')
    .map((g) => g.trim())
    .filter(Boolean);

export const joinGroups = (groups: string[]): string => groups.map((g) => g.trim()).filter(Boolean).join('|');

export function exerciseTotals(ex: ExerciseWithSets) {
  let reps = 0;
  let volume = 0;
  let topWeight: number | null = null;
  for (const s of ex.set_list) {
    reps += s.reps || 0;
    volume += (s.reps || 0) * (s.weight_kg || 0);
    if (s.weight_kg != null && (topWeight == null || s.weight_kg > topWeight)) topWeight = s.weight_kg;
  }
  return { sets: ex.set_list.length, reps, volume, topWeight };
}

export function workoutTotals(w: WorkoutWithExercises) {
  let sets = 0;
  let reps = 0;
  let volume = 0;
  for (const ex of w.exercises) {
    const t = exerciseTotals(ex);
    sets += t.sets;
    reps += t.reps;
    volume += t.volume;
  }
  return { sets, reps, volume, exercises: w.exercises.length };
}

export const exerciseKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export interface ExerciseSession {
  date: ISODate;
  workout_id: string;
  exercise_id: string;
  name: string;
  sets: { reps: number; weight_kg: number | null }[];
  /** Heaviest weight used, null when every set was bodyweight. */
  topWeight: number | null;
  maxReps: number;
  volume: number;
  /** Best estimated one-rep max (Epley), null for bodyweight sessions. */
  est1RM: number | null;
  bodyweight: boolean;
}

function sortWorkouts(workouts: WorkoutWithExercises[]) {
  return [...workouts].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}

const historyCache = new WeakMap<WorkoutWithExercises[], Map<string, ExerciseSession[]>>();

/** Chronological sessions per exercise (keyed by normalised name). */
export function exerciseHistory(workouts: WorkoutWithExercises[]): Map<string, ExerciseSession[]> {
  const cached = historyCache.get(workouts);
  if (cached) return cached;
  const map = new Map<string, ExerciseSession[]>();
  for (const w of sortWorkouts(workouts)) {
    for (const ex of w.exercises) {
      if (!ex.set_list.length) continue;
      const t = exerciseTotals(ex);
      const weighted = ex.set_list.some((s) => (s.weight_kg ?? 0) > 0);
      let est: number | null = null;
      if (weighted) {
        for (const s of ex.set_list) {
          if (!s.weight_kg || !s.reps) continue;
          const e = s.weight_kg * (1 + Math.min(s.reps, 12) / 30);
          if (est == null || e > est) est = e;
        }
      }
      const session: ExerciseSession = {
        date: w.date,
        workout_id: w.workout_id,
        exercise_id: ex.exercise_id,
        name: ex.exercise_name.trim(),
        sets: ex.set_list.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg })),
        topWeight: weighted ? t.topWeight : null,
        maxReps: Math.max(0, ...ex.set_list.map((s) => s.reps || 0)),
        volume: t.volume,
        est1RM: est == null ? null : round(est, 1),
        bodyweight: !weighted,
      };
      const key = exerciseKey(ex.exercise_name);
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
  }
  historyCache.set(workouts, map);
  return map;
}

export interface PersonalRecord {
  date: ISODate;
  workout_id: string;
  exercise_id: string;
  exercise: string;
  kind: 'weight' | 'reps';
  value: number;
  previous: number;
}

const prCache = new WeakMap<WorkoutWithExercises[], PersonalRecord[]>();

/**
 * A personal record is a session that beats every earlier session of the same
 * exercise: heaviest weight for weighted lifts, most reps in a set for
 * bodyweight movements. The first ever session sets a baseline, not a PR.
 */
export function personalRecords(workouts: WorkoutWithExercises[]): PersonalRecord[] {
  const cached = prCache.get(workouts);
  if (cached) return cached;
  const out: PersonalRecord[] = [];
  for (const sessions of exerciseHistory(workouts).values()) {
    let bestWeight: number | null = null;
    let bestReps: number | null = null;
    for (const s of sessions) {
      if (s.topWeight != null) {
        if (bestWeight != null && s.topWeight > bestWeight) {
          out.push({ date: s.date, workout_id: s.workout_id, exercise_id: s.exercise_id, exercise: s.name, kind: 'weight', value: s.topWeight, previous: bestWeight });
        }
        bestWeight = bestWeight == null ? s.topWeight : Math.max(bestWeight, s.topWeight);
      } else {
        if (bestReps != null && s.maxReps > bestReps) {
          out.push({ date: s.date, workout_id: s.workout_id, exercise_id: s.exercise_id, exercise: s.name, kind: 'reps', value: s.maxReps, previous: bestReps });
        }
        bestReps = bestReps == null ? s.maxReps : Math.max(bestReps, s.maxReps);
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  prCache.set(workouts, out);
  return out;
}

/** The most recent earlier session of an exercise, for "last time" hints. */
export function previousSession(
  workouts: WorkoutWithExercises[],
  exerciseName: string,
  opts: { beforeDate?: ISODate; excludeWorkoutId?: string } = {},
): ExerciseSession | null {
  const sessions = exerciseHistory(workouts).get(exerciseKey(exerciseName));
  if (!sessions) return null;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (opts.excludeWorkoutId && s.workout_id === opts.excludeWorkoutId) continue;
    if (opts.beforeDate && s.date > opts.beforeDate) continue;
    return s;
  }
  return null;
}

export function bestForExercise(workouts: WorkoutWithExercises[], exerciseName: string, excludeWorkoutId?: string) {
  const sessions = (exerciseHistory(workouts).get(exerciseKey(exerciseName)) ?? []).filter(
    (s) => s.workout_id !== excludeWorkoutId,
  );
  if (!sessions.length) return null;
  const weights = sessions.map((s) => s.topWeight).filter((w): w is number => w != null);
  return {
    topWeight: weights.length ? Math.max(...weights) : null,
    maxReps: Math.max(...sessions.map((s) => s.maxReps)),
  };
}

export function muscleGroupCounts(workouts: WorkoutWithExercises[]) {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    const groups = new Set<string>(splitGroups(w.muscle_group));
    for (const ex of w.exercises) for (const g of splitGroups(ex.muscle_group)) groups.add(g);
    for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()].map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------- nutrition

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbohydrates: number;
  fats: number;
  entries: number;
}

export const emptyTotals = (): NutritionTotals => ({ calories: 0, protein: 0, carbohydrates: 0, fats: 0, entries: 0 });

export function sumNutrition(entries: MealEntry[]): NutritionTotals {
  const t = emptyTotals();
  for (const e of entries) {
    t.calories += e.calories || 0;
    t.protein += e.protein || 0;
    t.carbohydrates += e.carbohydrates || 0;
    t.fats += e.fats || 0;
    t.entries += 1;
  }
  return t;
}

const dailyCache = new WeakMap<MealEntry[], Map<ISODate, NutritionTotals>>();

export function dailyNutrition(meals: MealEntry[]): Map<ISODate, NutritionTotals> {
  const cached = dailyCache.get(meals);
  if (cached) return cached;
  const byDay = new Map<ISODate, MealEntry[]>();
  for (const m of meals) {
    const list = byDay.get(m.date) ?? [];
    list.push(m);
    byDay.set(m.date, list);
  }
  const out = new Map<ISODate, NutritionTotals>();
  for (const [d, list] of byDay) out.set(d, sumNutrition(list));
  dailyCache.set(meals, out);
  return out;
}

export const proteinTargetHit = (t: NutritionTotals, s: Settings) => s.protein_target_g > 0 && t.protein >= s.protein_target_g;

/** "On target" means within ±10% of the calorie goal — never rewarded for under-eating. */
export const calorieTargetHit = (t: NutritionTotals, s: Settings) =>
  s.calorie_target > 0 && t.entries > 0 && Math.abs(t.calories - s.calorie_target) <= s.calorie_target * 0.1;

// ---------------------------------------------------------------- body

export function sortedMetrics(metrics: BodyMetric[]): BodyMetric[] {
  return [...metrics].sort((a, b) => a.date.localeCompare(b.date));
}

export function weightEntries(metrics: BodyMetric[], to?: ISODate) {
  return sortedMetrics(metrics).filter((m) => m.weight_kg != null && (!to || m.date <= to)) as (BodyMetric & {
    weight_kg: number;
  })[];
}

export function currentWeight(metrics: BodyMetric[], to?: ISODate): number | null {
  const w = weightEntries(metrics, to);
  return w.length ? w[w.length - 1].weight_kg : null;
}

export function startingWeight(metrics: BodyMetric[], settings: Settings): number | null {
  if (settings.starting_weight_kg != null) return settings.starting_weight_kg;
  const w = weightEntries(metrics);
  return w.length ? w[0].weight_kg : null;
}

/** 0–100. Works for both weight loss and weight gain goals. */
export function goalProgressPct(start: number | null, current: number | null, target: number | null): number | null {
  if (start == null || current == null || target == null) return null;
  const total = target - start;
  if (Math.abs(total) < 0.01) return 100;
  const done = current - start;
  return Math.max(0, Math.min(100, (done / total) * 100));
}

/** Change in weight across a date window, using the nearest readings. */
export function weightChange(metrics: BodyMetric[], from: ISODate, to: ISODate): number | null {
  const w = weightEntries(metrics).filter((m) => m.date >= from && m.date <= to);
  if (w.length < 2) return null;
  return round(w[w.length - 1].weight_kg - w[0].weight_kg, 2);
}

// ---------------------------------------------------------------- consistency

const activityCache = new WeakMap<Dataset, ISODate[]>();

/** Every date with at least one logged workout, meal or body metric. */
export function activityDates(ds: Dataset): ISODate[] {
  const cached = activityCache.get(ds);
  if (cached) return cached;
  const set = new Set<ISODate>();
  for (const w of ds.workouts) set.add(w.date);
  for (const m of ds.meals) set.add(m.date);
  for (const b of ds.bodyMetrics) set.add(b.date);
  const out = [...set].sort();
  activityCache.set(ds, out);
  return out;
}

export function longestStreak(sortedDates: ISODate[]): number {
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const d of sortedDates) {
    run = prev && diffDays(d, prev) === 1 ? run + 1 : prev === d ? run : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Streak ending today (or yesterday, so an un-logged morning doesn't break it). */
export function currentStreak(sortedDates: ISODate[], today: ISODate): number {
  const set = new Set(sortedDates);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

export function workoutDates(workouts: WorkoutWithExercises[], from?: ISODate | null, to?: ISODate | null): ISODate[] {
  return [...new Set(workouts.filter((w) => inRange(w.date, from, to)).map((w) => w.date))].sort();
}

export function filterByRange<T extends { date: ISODate }>(rows: T[], from?: ISODate | null, to?: ISODate | null): T[] {
  return rows.filter((r) => inRange(r.date, from, to));
}

/** Group dates into Monday-start weeks: weekStart -> count of distinct days. */
export function weeklyBuckets(dates: ISODate[], from: ISODate, to: ISODate) {
  const buckets = new Map<ISODate, number>();
  for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) buckets.set(w, 0);
  for (const d of new Set(dates)) {
    if (d < from || d > to) continue;
    const k = startOfWeek(d);
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([week, count]) => ({ week, count }));
}
