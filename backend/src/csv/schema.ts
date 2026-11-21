// Declarative description of every CSV file. The store uses this to create
// missing files, add missing columns, and coerce cell strings to typed values.

export type ColumnType = 'string' | 'number' | 'int' | 'bool';

export interface TableDef {
  name: TableName;
  file: string;
  key: string;
  columns: Record<string, ColumnType>;
}

export type TableName =
  | 'workouts'
  | 'exercises'
  | 'exercise_sets'
  | 'meals'
  | 'body_metrics'
  | 'achievements'
  | 'achievement_rules'
  | 'user_settings';

const def = (name: TableName, key: string, columns: Record<string, ColumnType>): TableDef => ({
  name,
  file: `${name}.csv`,
  key,
  columns,
});

export const TABLES: Record<TableName, TableDef> = {
  workouts: def('workouts', 'workout_id', {
    workout_id: 'string',
    date: 'string',
    workout_name: 'string',
    muscle_group: 'string',
    duration_minutes: 'int',
    notes: 'string',
    created_at: 'string',
  }),
  exercises: def('exercises', 'exercise_id', {
    exercise_id: 'string',
    workout_id: 'string',
    exercise_name: 'string',
    muscle_group: 'string',
    sets: 'int',
    reps: 'int',
    weight_kg: 'number',
    rest_seconds: 'int',
    notes: 'string',
  }),
  exercise_sets: def('exercise_sets', 'set_id', {
    set_id: 'string',
    exercise_id: 'string',
    set_number: 'int',
    reps: 'int',
    weight_kg: 'number',
    notes: 'string',
  }),
  meals: def('meals', 'meal_id', {
    meal_id: 'string',
    date: 'string',
    meal_type: 'string',
    food_name: 'string',
    quantity: 'number',
    quantity_unit: 'string',
    calories: 'number',
    protein: 'number',
    carbohydrates: 'number',
    fats: 'number',
    notes: 'string',
  }),
  body_metrics: def('body_metrics', 'metric_id', {
    metric_id: 'string',
    date: 'string',
    weight_kg: 'number',
    body_fat_percentage: 'number',
    waist_cm: 'number',
    chest_cm: 'number',
    hips_cm: 'number',
    arm_cm: 'number',
    thigh_cm: 'number',
    notes: 'string',
  }),
  achievements: def('achievements', 'achievement_id', {
    achievement_id: 'string',
    achievement_name: 'string',
    achievement_category: 'string',
    achievement_level: 'string',
    description: 'string',
    unlocked_date: 'string',
    xp_awarded: 'int',
  }),
  achievement_rules: def('achievement_rules', 'rule_id', {
    rule_id: 'string',
    name: 'string',
    category: 'string',
    level: 'string',
    period: 'string',
    metric: 'string',
    threshold: 'number',
    xp: 'int',
    title_reward: 'string',
    description: 'string',
    icon: 'string',
    enabled: 'bool',
  }),
  user_settings: def('user_settings', 'setting_key', {
    setting_key: 'string',
    setting_value: 'string',
  }),
};

export const TABLE_LIST = Object.values(TABLES);
