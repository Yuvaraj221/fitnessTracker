// Demo records. Every sample row has an ID starting with `sample_` and a
// "[Sample]" note, so they are easy to spot and remove in one action
// (Settings → Data → Remove sample data, or `npm run sample:remove`).

import {
  addDays,
  isSampleId,
  SAMPLE_ID_PREFIX as P,
  todayISO,
  type BodyMetric,
  type Exercise,
  type ExerciseSet,
  type MealEntry,
  type MealType,
  type Workout,
} from '@forge/shared';
import { readTable, transaction, type Row, type Transaction } from '../csv/store';
import { createBackup } from './backup';

type Lift = { name: string; group: string; base: number | null; step: number; reps: number[]; rest: number };

const TEMPLATES: { name: string; groups: string[]; duration: number; lifts: Lift[] }[] = [
  {
    name: 'Push Day',
    groups: ['Chest', 'Shoulders', 'Triceps'],
    duration: 62,
    lifts: [
      { name: 'Bench Press', group: 'Chest', base: 60, step: 2.5, reps: [10, 8, 6], rest: 120 },
      { name: 'Overhead Press', group: 'Shoulders', base: 35, step: 2.5, reps: [10, 8, 8], rest: 90 },
      { name: 'Incline Dumbbell Press', group: 'Chest', base: 20, step: 2, reps: [12, 10, 10], rest: 90 },
      { name: 'Tricep Pushdown', group: 'Triceps', base: 25, step: 2.5, reps: [15, 12, 12], rest: 60 },
    ],
  },
  {
    name: 'Back & Biceps',
    groups: ['Back', 'Biceps'],
    duration: 58,
    lifts: [
      { name: 'Lat Pulldown', group: 'Back', base: 30, step: 2.5, reps: [12, 10, 8], rest: 90 },
      { name: 'Barbell Row', group: 'Back', base: 50, step: 2.5, reps: [10, 8, 8], rest: 120 },
      { name: 'Pull-up', group: 'Back', base: null, step: 0, reps: [8, 7, 6], rest: 120 },
      { name: 'Barbell Curl', group: 'Biceps', base: 25, step: 2.5, reps: [12, 10, 8], rest: 60 },
    ],
  },
  {
    name: 'Leg Day',
    groups: ['Quads', 'Hamstrings', 'Glutes'],
    duration: 70,
    lifts: [
      { name: 'Back Squat', group: 'Quads', base: 80, step: 5, reps: [8, 6, 6], rest: 150 },
      { name: 'Romanian Deadlift', group: 'Hamstrings', base: 70, step: 5, reps: [10, 8, 8], rest: 120 },
      { name: 'Walking Lunge', group: 'Glutes', base: null, step: 0, reps: [12, 12], rest: 90 },
      { name: 'Standing Calf Raise', group: 'Calves', base: 60, step: 5, reps: [15, 15, 12], rest: 60 },
    ],
  },
  {
    name: 'Upper Body',
    groups: ['Chest', 'Back', 'Shoulders'],
    duration: 55,
    lifts: [
      { name: 'Bench Press', group: 'Chest', base: 57.5, step: 2.5, reps: [12, 10, 10], rest: 120 },
      { name: 'Pull-up', group: 'Back', base: null, step: 0, reps: [7, 6, 6], rest: 120 },
      { name: 'Dumbbell Shoulder Press', group: 'Shoulders', base: 16, step: 2, reps: [12, 10, 10], rest: 90 },
      { name: 'Hammer Curl', group: 'Biceps', base: 12, step: 2, reps: [12, 12, 10], rest: 60 },
    ],
  },
];

/** Day offsets (0 = 20 days ago) on which a workout was logged: 4 per week, rest days between. */
const WORKOUT_DAYS = [0, 1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];

type Food = Omit<MealEntry, 'meal_id' | 'date' | 'meal_type' | 'notes'>;
const f = (food_name: string, quantity: number, quantity_unit: string, calories: number, protein: number, carbohydrates: number, fats: number): Food => ({
  food_name,
  quantity,
  quantity_unit,
  calories,
  protein,
  carbohydrates,
  fats,
});

const MENU: Record<MealType, Food[][]> = {
  breakfast: [
    [f('Rolled oats', 80, 'g', 303, 10.6, 54, 5.6), f('Whey protein', 1, 'scoop', 120, 24, 3, 1.5), f('Banana', 1, 'pieces', 105, 1.3, 27, 0.4)],
    [f('Eggs, scrambled', 3, 'pieces', 270, 19, 2, 20), f('Wholegrain toast', 2, 'slices', 160, 8, 28, 2), f('Orange juice', 250, 'ml', 112, 1.7, 26, 0.5)],
  ],
  lunch: [
    [f('Chicken breast, grilled', 200, 'g', 330, 62, 0, 7.2), f('Basmati rice, cooked', 250, 'g', 325, 6.7, 70, 0.8), f('Mixed salad, olive oil', 1, 'servings', 120, 2, 6, 10)],
    [f('Turkey wrap', 1, 'pieces', 420, 32, 45, 12), f('Lentil soup', 300, 'ml', 230, 14, 34, 4)],
  ],
  evening_snacks: [
    [f('Greek yogurt, plain', 200, 'g', 146, 20, 8, 4), f('Almonds', 30, 'g', 174, 6.3, 6.5, 15)],
    [f('Protein bar', 1, 'pieces', 210, 20, 22, 7), f('Apple', 1, 'pieces', 95, 0.5, 25, 0.3)],
  ],
  dinner: [
    [f('Salmon fillet', 150, 'g', 310, 30, 0, 20), f('Baby potatoes', 300, 'g', 231, 6, 52, 0.3), f('Broccoli, steamed', 150, 'g', 51, 4.2, 10, 0.6)],
    [f('Lean beef mince', 150, 'g', 300, 32, 0, 19), f('Wholewheat pasta, cooked', 220, 'g', 273, 11, 55, 2.5), f('Tomato sauce', 120, 'g', 60, 2, 10, 1.5)],
  ],
  other: [[f('Cottage cheese', 150, 'g', 147, 17, 5, 6.5)]],
};

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Three weeks of realistic training, nutrition and body data ending today. */
export function generateSampleData(today = todayISO()) {
  const rand = rng(47);
  const start = addDays(today, -20);
  const workouts: Workout[] = [];
  const exercises: Exercise[] = [];
  const sets: ExerciseSet[] = [];

  WORKOUT_DAYS.forEach((offset, i) => {
    const t = TEMPLATES[i % TEMPLATES.length];
    const week = Math.floor(i / TEMPLATES.length);
    const wid = `${P}wo_${pad(i + 1)}`;
    const date = addDays(start, offset);
    workouts.push({
      workout_id: wid,
      date,
      workout_name: t.name,
      muscle_group: t.groups.join('|'),
      duration_minutes: t.duration + Math.round(rand() * 8 - 4),
      notes: '[Sample] Demo workout — remove from Settings → Data.',
      created_at: `${date}T18:${pad(10 + i)}:00.000Z`,
    });
    t.lifts.forEach((lift, j) => {
      const eid = `${P}ex_${pad(i + 1)}_${j + 1}`;
      // Each lift progresses once over the three weeks (even lifts in week 2, odd lifts in week 3).
      const level = week === 0 ? 0 : week === 1 ? (j % 2 === 0 ? 1 : 0) : 1;
      const reps = lift.base == null ? lift.reps.map((r) => r + level) : lift.reps;
      const weights = reps.map(() => (lift.base == null ? null : lift.base + lift.step * level));
      reps.forEach((rep, k) =>
        sets.push({ set_id: `${P}set_${pad(i + 1)}_${j + 1}_${k + 1}`, exercise_id: eid, set_number: k + 1, reps: rep, weight_kg: weights[k], notes: '' }),
      );
      const ws = weights.filter((w): w is number => w != null);
      exercises.push({
        exercise_id: eid,
        workout_id: wid,
        exercise_name: lift.name,
        muscle_group: lift.group,
        sets: reps.length,
        reps: reps.reduce((a, b) => a + b, 0),
        weight_kg: ws.length ? Math.max(...ws) : null,
        rest_seconds: lift.rest,
        notes: '',
      });
    });
  });

  const meals: MealEntry[] = [];
  for (let d = 0; d <= 20; d++) {
    const date = addDays(start, d);
    const isToday = d === 20;
    const types: MealType[] = isToday ? ['breakfast', 'lunch'] : ['breakfast', 'lunch', 'evening_snacks', 'dinner'];
    if (!isToday && rand() < 0.3) types.push('other');
    for (const type of types) {
      const options = MENU[type];
      const choice = options[Math.floor(rand() * options.length)];
      // Skip the snack on a few days so protein targets are sometimes missed.
      if (type === 'evening_snacks' && rand() < 0.2) continue;
      choice.forEach((food, k) => {
        const scale = 0.9 + rand() * 0.2;
        meals.push({
          ...food,
          meal_id: `${P}meal_${pad(d + 1)}_${type}_${k + 1}`,
          date,
          meal_type: type,
          quantity: food.quantity_unit === 'g' || food.quantity_unit === 'ml' ? Math.round(food.quantity! * scale) : food.quantity,
          calories: Math.round(food.calories * scale),
          protein: r1(food.protein * scale),
          carbohydrates: r1(food.carbohydrates * scale),
          fats: r1(food.fats * scale),
          notes: '[Sample]',
        });
      });
    }
  }

  const bodyMetrics: BodyMetric[] = [];
  for (let d = 0, n = 0; d <= 20; d += 3, n++) {
    const weekly = n % 2 === 0;
    bodyMetrics.push({
      metric_id: `${P}bm_${pad(n + 1)}`,
      date: addDays(start, d),
      weight_kg: r1(82.6 - d * 0.07 + (rand() - 0.5) * 0.4),
      body_fat_percentage: weekly ? r1(19.8 - d * 0.035) : null,
      waist_cm: weekly ? r1(88 - d * 0.05) : null,
      chest_cm: weekly ? r1(104 + (rand() - 0.5) * 0.4) : null,
      hips_cm: weekly ? r1(99 - d * 0.02) : null,
      arm_cm: weekly ? r1(35.6 + d * 0.01) : null,
      thigh_cm: null,
      notes: '[Sample]',
    });
  }
  return { workouts, exercises, sets, meals, bodyMetrics };
}

function stripSample(tx: Transaction) {
  return Promise.all([
    tx.read<Workout>('workouts').then((rows) => tx.write('workouts', rows.filter((r) => !isSampleId(r.workout_id)) as unknown as Row[])),
    tx.read<Exercise>('exercises').then((rows) =>
      tx.write('exercises', rows.filter((r) => !isSampleId(r.exercise_id) && !isSampleId(r.workout_id)) as unknown as Row[]),
    ),
    tx.read<ExerciseSet>('exercise_sets').then((rows) =>
      tx.write('exercise_sets', rows.filter((r) => !isSampleId(r.set_id) && !isSampleId(r.exercise_id)) as unknown as Row[]),
    ),
    tx.read<MealEntry>('meals').then((rows) => tx.write('meals', rows.filter((r) => !isSampleId(r.meal_id)) as unknown as Row[])),
    tx.read<BodyMetric>('body_metrics').then((rows) =>
      tx.write('body_metrics', rows.filter((r) => !isSampleId(r.metric_id)) as unknown as Row[]),
    ),
  ]);
}

/**
 * Removes every sample row. Achievements are then rebuilt from the remaining
 * (real) data, because sample-driven unlocks can't be told apart otherwise;
 * unlock dates are derived from the data, so real achievements keep their dates.
 */
export function removeSampleData() {
  return transaction(async (tx) => {
    const before = await sampleRowCount();
    await createBackup('before removing sample data');
    await stripSample(tx);
    tx.write('achievements', []);
    const settings = await tx.read('user_settings');
    const seen = settings.find((r) => r.setting_key === 'achievements_seen_count');
    if (seen) seen.setting_value = '0';
    tx.write('user_settings', settings);
    return { removed: before };
  });
}

/** Replaces any existing sample rows with a fresh set ending today. User rows are untouched. */
export function loadSampleData(today = todayISO()) {
  return transaction(async (tx) => {
    await stripSample(tx);
    const s = generateSampleData(today);
    tx.write('workouts', [...(await tx.read('workouts')), ...(s.workouts as unknown as Row[])]);
    tx.write('exercises', [...(await tx.read('exercises')), ...(s.exercises as unknown as Row[])]);
    tx.write('exercise_sets', [...(await tx.read('exercise_sets')), ...(s.sets as unknown as Row[])]);
    tx.write('meals', [...(await tx.read('meals')), ...(s.meals as unknown as Row[])]);
    tx.write('body_metrics', [...(await tx.read('body_metrics')), ...(s.bodyMetrics as unknown as Row[])]);
    const settings = await tx.read('user_settings');
    const target = settings.find((r) => r.setting_key === 'target_weight_kg');
    if (target && !String(target.setting_value ?? '').trim()) target.setting_value = '78';
    tx.write('user_settings', settings);
    return { workouts: s.workouts.length, meals: s.meals.length, bodyMetrics: s.bodyMetrics.length };
  });
}

export async function sampleRowCount() {
  const [w, m, b] = await Promise.all([readTable<Workout>('workouts'), readTable<MealEntry>('meals'), readTable<BodyMetric>('body_metrics')]);
  return (
    w.filter((r) => isSampleId(r.workout_id)).length +
    m.filter((r) => isSampleId(r.meal_id)).length +
    b.filter((r) => isSampleId(r.metric_id)).length
  );
}
