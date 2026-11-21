import { Router } from 'express';
import { transaction } from '../csv/store';
import { achievementOverview, evaluateAndStore } from '../services/achievements';
import { loadUnlocked } from '../services/repo';

export const achievementsRouter = Router();

achievementsRouter.get('/', async (_req, res) => {
  res.json({ data: await achievementOverview() });
});

achievementsRouter.post('/evaluate', async (_req, res) => {
  res.json({ data: await evaluateAndStore() });
});

/** Marks every current unlock as seen (clears the notification badge). */
achievementsRouter.post('/seen', async (_req, res) => {
  const count = (await loadUnlocked()).length;
  await transaction(async (tx) => {
    const rows = await tx.read('user_settings');
    const row = rows.find((r) => r.setting_key === 'achievements_seen_count');
    if (row) row.setting_value = String(count);
    else rows.push({ setting_key: 'achievements_seen_count', setting_value: String(count) });
    tx.write('user_settings', rows);
  });
  res.json({ data: { seen: count } });
});
