import type { BodyMetric, MealEntry } from '@forge/shared';
import { bodyMetricInput, mealInput } from '../lib/validation';
import { crudRouter } from './crud';

export const mealsRouter = crudRouter<MealEntry>({
  table: 'meals',
  key: 'meal_id',
  idPrefix: 'meal',
  label: 'Food entry',
  schema: mealInput as never,
  describe: (m) => `${m.food_name} on ${m.date}`,
});

export const bodyMetricsRouter = crudRouter<BodyMetric>({
  table: 'body_metrics',
  key: 'metric_id',
  idPrefix: 'bm',
  label: 'Body metric',
  schema: bodyMetricInput as never,
  describe: (m) => `body metric on ${m.date}`,
});
