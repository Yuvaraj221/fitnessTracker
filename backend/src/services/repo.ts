// Typed access to the CSV tables, plus joins (workout -> exercises -> sets).

import {
  DEFAULT_SETTINGS,
  type AchievementRule,
  type BodyMetric,
  type Dataset,
  type Exercise,
  type ExerciseSet,
  type MealEntry,
  type Settings,
  type UnlockedAchievement,
  type Workout,
  type WorkoutWithExercises,
} from '@forge/shared';
import { readTable, type Row } from '../csv/store';

export function joinWorkouts(workouts: Workout[], exercises: Exercise[], sets: ExerciseSet[]): WorkoutWithExercises[] {
  const setsByExercise = new Map<string, ExerciseSet[]>();
  for (const s of sets) {
    const list = setsByExercise.get(s.exercise_id) ?? [];
    list.push(s);
    setsByExercise.set(s.exercise_id, list);
  }
  const exByWorkout = new Map<string, Exercise[]>();
  for (const e of exercises) {
    const list = exByWorkout.get(e.workout_id) ?? [];
    list.push(e);
    exByWorkout.set(e.workout_id, list);
  }
  return workouts
    .map((w) => ({
      ...w,
      exercises: (exByWorkout.get(w.workout_id) ?? []).map((e) => ({
        ...e,
        set_list: (setsByExercise.get(e.exercise_id) ?? []).sort((a, b) => a.set_number - b.set_number),
      })),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

export async function loadWorkouts(): Promise<WorkoutWithExercises[]> {
  const [w, e, s] = await Promise.all([
    readTable<Workout>('workouts'),
    readTable<Exercise>('exercises'),
    readTable<ExerciseSet>('exercise_sets'),
  ]);
  return joinWorkouts(w, e, s);
}

export const loadMeals = () => readTable<MealEntry>('meals');
export const loadBodyMetrics = () => readTable<BodyMetric>('body_metrics');
export const loadUnlocked = () => readTable<UnlockedAchievement>('achievements');
export const loadRules = () => readTable<AchievementRule>('achievement_rules');

/** Converts key/value rows into a typed Settings object using DEFAULT_SETTINGS as the type template. */
export function settingsFromRows(rows: Row[]): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const template = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  for (const r of rows) {
    const key = String(r.setting_key);
    const raw = String(r.setting_value ?? '');
    if (!(key in template)) {
      out[key] = raw;
      continue;
    }
    const def = template[key];
    if (typeof def === 'boolean') out[key] = raw === 'true';
    else if (typeof def === 'number' || def === null) {
      const n = raw.trim() === '' ? null : Number(raw);
      out[key] = n == null || !Number.isFinite(n) ? (def === null ? null : def) : n;
    } else out[key] = raw;
  }
  return out as unknown as Settings;
}

export async function loadSettings(): Promise<Settings> {
  return settingsFromRows(await readTable('user_settings'));
}

export async function loadDataset(): Promise<Dataset> {
  const [workouts, meals, bodyMetrics, settings] = await Promise.all([
    loadWorkouts(),
    loadMeals(),
    loadBodyMetrics(),
    loadSettings(),
  ]);
  return { workouts, meals, bodyMetrics, settings };
}
