import { MEAL_TYPES, isValidISODate } from '@forge/shared';
import { z } from 'zod';
import { badRequest } from './errors';

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.join('.');
  throw badRequest(field ? `${field}: ${issue.message}` : issue.message, result.error.issues);
}

const isoDate = z.string().refine(isValidISODate, 'Use a real date in YYYY-MM-DD format');
const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const optText = (max: number) => text(max).optional().default('');
const optNum = (max: number, label = 'This value') =>
  z
    .number()
    .min(0, `${label} can't be negative`)
    .max(max, `${label} looks too high (max ${max})`)
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const setInput = z.object({
  reps: z.number().int('Reps must be a whole number').min(0, "Reps can't be negative").max(1000),
  weight_kg: optNum(1000, 'Weight'),
  notes: optText(200),
});

export const exerciseInput = z.object({
  exercise_name: text(120).min(1, 'Name each exercise'),
  muscle_group: optText(120),
  rest_seconds: optNum(3600, 'Rest time'),
  notes: optText(500),
  sets: z.array(setInput).min(1, 'Add at least one set').max(50),
});

export const workoutInput = z.object({
  date: isoDate,
  workout_name: text(120).min(1, 'Give the workout a name'),
  muscle_groups: z.array(text(40)).max(20).default([]),
  duration_minutes: optNum(1440, 'Duration'),
  notes: optText(2000),
  exercises: z.array(exerciseInput).max(60).default([]),
});
export type WorkoutInput = z.infer<typeof workoutInput>;

export const mealInput = z.object({
  date: isoDate,
  meal_type: z.enum(MEAL_TYPES, 'Choose a meal'),
  food_name: text(160).min(1, 'Name the food'),
  quantity: optNum(100000, 'Quantity'),
  quantity_unit: optText(30),
  calories: z.number().min(0, "Calories can't be negative").max(20000),
  protein: z.number().min(0).max(2000).default(0),
  carbohydrates: z.number().min(0).max(2000).default(0),
  fats: z.number().min(0).max(2000).default(0),
  notes: optText(500),
});

export const bodyMetricInput = z
  .object({
    date: isoDate,
    weight_kg: optNum(500, 'Weight'),
    body_fat_percentage: z.number().min(1).max(75).nullable().optional().transform((v) => v ?? null),
    waist_cm: optNum(300, 'Waist'),
    chest_cm: optNum(300, 'Chest'),
    hips_cm: optNum(300, 'Hips'),
    arm_cm: optNum(150, 'Arm'),
    thigh_cm: optNum(200, 'Thigh'),
    notes: optText(500),
  })
  .refine(
    (m) => [m.weight_kg, m.body_fat_percentage, m.waist_cm, m.chest_cm, m.hips_cm, m.arm_cm, m.thigh_cm].some((v) => v != null),
    'Enter at least one measurement',
  );

export const settingsInput = z
  .object({
    display_name: text(60),
    current_weight_kg: z.number().min(20).max(500).nullable(),
    starting_weight_kg: z.number().min(20).max(500).nullable(),
    target_weight_kg: z.number().min(20).max(500).nullable(),
    calorie_target: z.number().int().min(800, 'Calorie target should be at least 800').max(10000),
    protein_target_g: z.number().min(0).max(1000),
    carbs_target_g: z.number().min(0).max(2000),
    fat_target_g: z.number().min(0).max(1000),
    weekly_workout_target: z.number().int().min(1).max(7),
    weight_unit: z.enum(['kg', 'lbs']),
    length_unit: z.enum(['cm', 'in']),
    achievement_notifications: z.boolean(),
    show_locked_achievements: z.boolean(),
    active_title: text(60),
    achievements_seen_count: z.number().int().min(0),
  })
  .partial();
