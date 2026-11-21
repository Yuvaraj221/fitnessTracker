// Domain types shared by the FORGE backend and frontend.
// All weights are stored in kilograms and all lengths in centimetres.
// Dates are local calendar dates formatted as YYYY-MM-DD.

export type ISODate = string;

export interface Workout {
  workout_id: string;
  date: ISODate;
  workout_name: string;
  /** Pipe-separated list in CSV, e.g. "Back|Biceps". */
  muscle_group: string;
  duration_minutes: number | null;
  notes: string;
  created_at: string;
}

export interface Exercise {
  exercise_id: string;
  workout_id: string;
  exercise_name: string;
  muscle_group: string;
  /** Denormalised summary: number of sets. */
  sets: number;
  /** Denormalised summary: total reps across sets. */
  reps: number;
  /** Denormalised summary: heaviest set weight (null for bodyweight). */
  weight_kg: number | null;
  rest_seconds: number | null;
  notes: string;
}

export interface ExerciseSet {
  set_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number | null;
  notes: string;
}

export interface ExerciseWithSets extends Exercise {
  set_list: ExerciseSet[];
}

export interface WorkoutWithExercises extends Workout {
  exercises: ExerciseWithSets[];
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'evening_snacks', 'dinner', 'other'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  evening_snacks: 'Evening Snacks',
  dinner: 'Dinner',
  other: 'Other',
};

/** One food item. A "meal" is every entry sharing a date + meal_type. */
export interface MealEntry {
  meal_id: string;
  date: ISODate;
  meal_type: MealType;
  food_name: string;
  quantity: number | null;
  quantity_unit: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fats: number;
  notes: string;
}

export interface BodyMetric {
  metric_id: string;
  date: ISODate;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  notes: string;
}

export const MEASUREMENT_KEYS = ['waist_cm', 'chest_cm', 'hips_cm', 'arm_cm', 'thigh_cm'] as const;
export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];
export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  waist_cm: 'Waist',
  chest_cm: 'Chest',
  hips_cm: 'Hips',
  arm_cm: 'Arm',
  thigh_cm: 'Thigh',
};

export type AchievementPeriod = 'lifetime' | 'weekly' | 'monthly' | 'yearly';
export type AchievementLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

/** A configurable rule, one row of achievement_rules.csv. */
export interface AchievementRule {
  rule_id: string;
  name: string;
  category: string;
  level: AchievementLevel;
  period: AchievementPeriod;
  metric: string;
  threshold: number;
  xp: number;
  title_reward: string;
  description: string;
  icon: string;
  enabled: boolean;
}

/** One unlock, one row of achievements.csv. Periodic rules unlock once per period. */
export interface UnlockedAchievement {
  /** rule_id for lifetime rules, `${rule_id}@${periodKey}` for periodic rules. */
  achievement_id: string;
  achievement_name: string;
  achievement_category: string;
  achievement_level: AchievementLevel;
  description: string;
  unlocked_date: ISODate;
  xp_awarded: number;
}

export interface Settings {
  display_name: string;
  starting_weight_kg: number | null;
  target_weight_kg: number | null;
  calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  weekly_workout_target: number;
  weight_unit: 'kg' | 'lbs';
  length_unit: 'cm' | 'in';
  achievement_notifications: boolean;
  show_locked_achievements: boolean;
  active_title: string;
  achievements_seen_count: number;
}

export const DEFAULT_SETTINGS: Settings = {
  display_name: 'Athlete',
  starting_weight_kg: null,
  target_weight_kg: null,
  calorie_target: 2400,
  protein_target_g: 150,
  carbs_target_g: 260,
  fat_target_g: 75,
  weekly_workout_target: 4,
  weight_unit: 'kg',
  length_unit: 'cm',
  achievement_notifications: true,
  show_locked_achievements: true,
  active_title: '',
  achievements_seen_count: 0,
};

/** Everything the analytics / achievement engine needs. */
export interface Dataset {
  workouts: WorkoutWithExercises[];
  meals: MealEntry[];
  bodyMetrics: BodyMetric[];
  settings: Settings;
}

/** Mutation responses always carry any achievements unlocked by the change. */
export interface MutationResult<T> {
  data: T;
  unlocked: UnlockedAchievement[];
}

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Core',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Full Body',
  'Cardio',
] as const;

export const SAMPLE_ID_PREFIX = 'sample_';
export const isSampleId = (id: string) => id.startsWith(SAMPLE_ID_PREFIX);
