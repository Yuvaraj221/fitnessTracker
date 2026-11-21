import { todayISO, type BodyMetric } from '@forge/shared';
import { Router } from 'express';
import { transaction, type Row } from '../csv/store';
import { newId } from '../lib/ids';
import { sendMutation } from '../lib/respond';
import { settingsInput, validate } from '../lib/validation';
import { loadSettings, settingsFromRows } from '../services/repo';

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  res.json({ data: await loadSettings() });
});

/**
 * Partial update. `current_weight_kg` is not stored as a setting: body weight
 * lives in body_metrics.csv, so it upserts today's body metric instead.
 */
settingsRouter.put('/', async (req, res) => {
  const { current_weight_kg, ...input } = validate(settingsInput, req.body);
  const settings = await transaction(async (tx) => {
    const rows = await tx.read('user_settings');
    for (const [key, value] of Object.entries(input)) {
      const cell = value == null ? '' : String(value);
      const existing = rows.find((r) => r.setting_key === key);
      if (existing) existing.setting_value = cell;
      else rows.push({ setting_key: key, setting_value: cell });
    }
    tx.write('user_settings', rows);

    if (current_weight_kg != null) {
      const metrics = await tx.read<BodyMetric>('body_metrics');
      const today = todayISO();
      const todays = metrics.find((m) => m.date === today);
      if (todays) todays.weight_kg = current_weight_kg;
      else
        metrics.push({
          metric_id: newId('bm'),
          date: today,
          weight_kg: current_weight_kg,
          body_fat_percentage: null,
          waist_cm: null,
          chest_cm: null,
          hips_cm: null,
          arm_cm: null,
          thigh_cm: null,
          notes: 'Updated from Settings',
        });
      tx.write('body_metrics', metrics as unknown as Row[]);
    }
    return settingsFromRows(rows);
  });
  await sendMutation(res, settings);
});
