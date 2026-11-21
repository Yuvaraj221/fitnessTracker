import {
  activityXp,
  evaluateAchievements,
  levelForXp,
  ruleProgress,
  titles,
  todayISO,
  type UnlockedAchievement,
} from '@forge/shared';
import { transaction } from '../csv/store';
import { loadDataset, loadRules, loadUnlocked } from './repo';

/**
 * Evaluates every rule against the current CSV data and appends new unlocks
 * to achievements.csv. Already-recorded achievement IDs are never re-awarded.
 */
export function evaluateAndStore(): Promise<UnlockedAchievement[]> {
  return transaction(async (tx) => {
    const [ds, rules, existing] = await Promise.all([loadDataset(), loadRules(), tx.read<UnlockedAchievement>('achievements')]);
    const fresh = evaluateAchievements(rules, ds, existing, todayISO());
    if (fresh.length) tx.write('achievements', [...existing, ...fresh] as never);
    return fresh;
  });
}

export async function achievementOverview() {
  const [ds, rules, unlocked] = await Promise.all([loadDataset(), loadRules(), loadUnlocked()]);
  const today = todayISO();
  const activity = activityXp(ds);
  const achievementXp = unlocked.reduce((s, u) => s + (u.xp_awarded || 0), 0);
  const totalXp = activity.total + achievementXp;
  const level = levelForXp(totalXp);
  const sorted = [...unlocked].sort((a, b) => b.unlocked_date.localeCompare(a.unlocked_date));
  return {
    rules,
    unlocked: sorted,
    progress: ruleProgress(rules, ds, unlocked, today),
    xp: { activity, achievements: achievementXp, total: totalXp },
    level,
    titles: titles(level.level, rules, unlocked),
    activeTitle: ds.settings.active_title || level.title,
    unseen: Math.max(0, unlocked.length - ds.settings.achievements_seen_count),
  };
}
