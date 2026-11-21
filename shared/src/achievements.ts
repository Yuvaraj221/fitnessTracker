// Rule-driven achievement engine.
//
// Rules live in data/achievement_rules.csv. Each rule names a metric from the
// METRICS registry below, a threshold and a period. The engine evaluates rules
// against the dataset; UI components never contain achievement conditions.
//
// Healthy-by-design guardrails:
//  * Workout metrics count distinct training days, so double sessions earn nothing extra.
//  * No rule rewards more than 5 training days in a week ("balanced_week" requires rest days).
//  * Calorie rewards are for landing within ±10% of target, never for eating less.
//  * Streaks count any tracking (meals, metrics or workouts), so rest days keep streaks alive.

import {
  activityDates,
  calorieTargetHit,
  currentWeight,
  dailyNutrition,
  goalProgressPct,
  longestStreak,
  personalRecords,
  proteinTargetHit,
  startingWeight,
  workoutDates,
  workoutTotals,
} from './analytics';
import { endOfMonth, endOfWeek, endOfYear, inRange, isoWeekKey, startOfMonth, startOfWeek, startOfYear } from './dates';
import type { AchievementPeriod, AchievementRule, Dataset, ISODate, UnlockedAchievement } from './types';

export interface Window {
  from?: ISODate | null;
  to?: ISODate | null;
}

export interface MetricDef {
  label: string;
  unit: string;
  compute: (ds: Dataset, w: Window) => number;
}

const consecutiveDays = longestStreak;

function nutritionDays(ds: Dataset, w: Window, pred: (d: ISODate) => boolean): ISODate[] {
  const daily = dailyNutrition(ds.meals);
  const out: ISODate[] = [];
  for (const [d, t] of daily) {
    if (!inRange(d, w.from, w.to)) continue;
    if (t.entries > 0 && pred(d)) out.push(d);
  }
  return out.sort();
}

export const METRICS: Record<string, MetricDef> = {
  workout_days: {
    label: 'Training days',
    unit: 'days',
    compute: (ds, w) => workoutDates(ds.workouts, w.from, w.to).length,
  },
  balanced_week: {
    label: 'Balanced week (3–5 training days)',
    unit: 'week',
    compute: (ds, w) => {
      const n = workoutDates(ds.workouts, w.from, w.to).length;
      return n >= 3 && n <= 5 ? 1 : 0;
    },
  },
  tracking_streak: {
    label: 'Longest tracking streak',
    unit: 'days',
    compute: (ds, w) => consecutiveDays(activityDates(ds).filter((d) => inRange(d, w.from, w.to))),
  },
  tracking_days: {
    label: 'Days tracked',
    unit: 'days',
    compute: (ds, w) => activityDates(ds).filter((d) => inRange(d, w.from, w.to)).length,
  },
  nutrition_days: {
    label: 'Days with meals logged',
    unit: 'days',
    compute: (ds, w) => nutritionDays(ds, w, () => true).length,
  },
  protein_target_days: {
    label: 'Days protein target hit',
    unit: 'days',
    compute: (ds, w) => {
      const daily = dailyNutrition(ds.meals);
      return nutritionDays(ds, w, (d) => proteinTargetHit(daily.get(d)!, ds.settings)).length;
    },
  },
  protein_target_streak: {
    label: 'Protein target streak',
    unit: 'days',
    compute: (ds, w) => {
      const daily = dailyNutrition(ds.meals);
      return consecutiveDays(nutritionDays(ds, w, (d) => proteinTargetHit(daily.get(d)!, ds.settings)));
    },
  },
  calorie_target_days: {
    label: 'Days within ±10% of calorie target',
    unit: 'days',
    compute: (ds, w) => {
      const daily = dailyNutrition(ds.meals);
      return nutritionDays(ds, w, (d) => calorieTargetHit(daily.get(d)!, ds.settings)).length;
    },
  },
  personal_records: {
    label: 'Personal records',
    unit: 'PRs',
    compute: (ds, w) => personalRecords(ds.workouts).filter((p) => inRange(p.date, w.from, w.to)).length,
  },
  total_volume_kg: {
    label: 'Volume lifted',
    unit: 'kg',
    compute: (ds, w) =>
      ds.workouts.filter((x) => inRange(x.date, w.from, w.to)).reduce((sum, x) => sum + workoutTotals(x).volume, 0),
  },
  body_logs: {
    label: 'Body check-ins',
    unit: 'entries',
    compute: (ds, w) => ds.bodyMetrics.filter((m) => inRange(m.date, w.from, w.to)).length,
  },
  goal_progress_pct: {
    label: 'Progress to target weight',
    unit: '%',
    compute: (ds, w) =>
      goalProgressPct(
        startingWeight(ds.bodyMetrics, ds.settings),
        currentWeight(ds.bodyMetrics, w.to ?? undefined),
        ds.settings.target_weight_kg,
      ) ?? 0,
  },
};

// ---------------------------------------------------------------- periods

export function periodWindow(period: AchievementPeriod, date: ISODate): { key: string; from: ISODate; to: ISODate } | null {
  switch (period) {
    case 'weekly':
      return { key: isoWeekKey(date), from: startOfWeek(date), to: endOfWeek(date) };
    case 'monthly':
      return { key: date.slice(0, 7), from: startOfMonth(date), to: endOfMonth(date) };
    case 'yearly':
      return { key: date.slice(0, 4), from: startOfYear(date), to: endOfYear(date) };
    default:
      return null;
  }
}

/** Every period window that contains activity, oldest first. */
function windowsWithActivity(period: AchievementPeriod, dates: ISODate[]) {
  const seen = new Map<string, { key: string; from: ISODate; to: ISODate }>();
  for (const d of dates) {
    const w = periodWindow(period, d);
    if (w && !seen.has(w.key)) seen.set(w.key, w);
  }
  return [...seen.values()];
}

export const unlockId = (rule: AchievementRule, periodKey?: string) =>
  periodKey ? `${rule.rule_id}@${periodKey}` : rule.rule_id;

export const ruleIdOf = (achievementId: string) => achievementId.split('@')[0];

/**
 * Earliest activity date at which the rule's threshold was met — used as the
 * unlock date, so back-filled achievements show when they were really earned.
 */
function findUnlockDate(def: MetricDef, rule: AchievementRule, ds: Dataset, dates: ISODate[], from: ISODate | null): ISODate {
  let lo = 0;
  let hi = dates.length - 1;
  let found = dates[hi];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (def.compute(ds, { from, to: dates[mid] }) >= rule.threshold) {
      found = dates[mid];
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return found;
}

/** Returns achievements newly earned that are not already in `existing`. */
export function evaluateAchievements(
  rules: AchievementRule[],
  ds: Dataset,
  existing: UnlockedAchievement[],
  today: ISODate,
): UnlockedAchievement[] {
  const have = new Set(existing.map((a) => a.achievement_id));
  const dates = activityDates(ds).filter((d) => d <= today);
  if (!dates.length) return [];
  const out: UnlockedAchievement[] = [];

  const award = (rule: AchievementRule, id: string, date: ISODate) => {
    have.add(id);
    out.push({
      achievement_id: id,
      achievement_name: rule.name,
      achievement_category: rule.category,
      achievement_level: rule.level,
      description: rule.description,
      unlocked_date: date,
      xp_awarded: rule.xp,
    });
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const def = METRICS[rule.metric];
    if (!def) continue;

    if (rule.period === 'lifetime') {
      const id = unlockId(rule);
      if (have.has(id)) continue;
      if (def.compute(ds, { to: today }) >= rule.threshold) award(rule, id, findUnlockDate(def, rule, ds, dates, null));
      continue;
    }

    for (const w of windowsWithActivity(rule.period, dates)) {
      const id = unlockId(rule, w.key);
      if (have.has(id)) continue;
      const to = w.to < today ? w.to : today;
      if (def.compute(ds, { from: w.from, to }) >= rule.threshold) {
        const inWindow = dates.filter((d) => d >= w.from && d <= to);
        award(rule, id, findUnlockDate(def, rule, ds, inWindow, w.from));
      }
    }
  }
  return out.sort((a, b) => a.unlocked_date.localeCompare(b.unlocked_date));
}

export interface RuleProgress {
  rule: AchievementRule;
  /** Current value: lifetime total, or the value in the current period. */
  current: number;
  pct: number;
  timesEarned: number;
  lastUnlocked: UnlockedAchievement | null;
  unlocked: boolean;
  /** Periodic rules only: already earned in the current period. */
  earnedThisPeriod: boolean;
}

export function ruleProgress(
  rules: AchievementRule[],
  ds: Dataset,
  unlocked: UnlockedAchievement[],
  today: ISODate,
): RuleProgress[] {
  return rules
    .filter((r) => r.enabled)
    .map((rule) => {
      const def = METRICS[rule.metric];
      const w = periodWindow(rule.period, today);
      const current = def ? def.compute(ds, w ? { from: w.from, to: today } : { to: today }) : 0;
      const mine = unlocked
        .filter((u) => ruleIdOf(u.achievement_id) === rule.rule_id)
        .sort((a, b) => a.unlocked_date.localeCompare(b.unlocked_date));
      const thisPeriodEarned = w ? mine.some((u) => u.achievement_id === unlockId(rule, w.key)) : mine.length > 0;
      return {
        rule,
        current,
        pct: rule.threshold > 0 ? Math.min(100, (current / rule.threshold) * 100) : 100,
        timesEarned: mine.length,
        lastUnlocked: mine[mine.length - 1] ?? null,
        unlocked: mine.length > 0,
        earnedThisPeriod: thisPeriodEarned,
      };
    });
}

// ---------------------------------------------------------------- XP, levels & titles

export const LEVELS = [
  { level: 1, xp: 0, title: 'Iron Rookie' },
  { level: 2, xp: 300, title: 'Earthbender' },
  { level: 3, xp: 800, title: 'Firebender' },
  { level: 4, xp: 1600, title: 'Prime' },
  { level: 5, xp: 3000, title: 'Elite' },
  { level: 6, xp: 5000, title: 'The Evolution' },
] as const;

const XP_PER_LEVEL_AFTER_MAX = 2500;

/** XP awarded for showing up, independent of achievements. Capped per day. */
export const ACTIVITY_XP = { workoutDay: 40, nutritionDay: 10, bodyMetricDay: 5 } as const;

export function activityXp(ds: Dataset) {
  const workout = workoutDates(ds.workouts).length * ACTIVITY_XP.workoutDay;
  const nutrition = new Set(ds.meals.map((m) => m.date)).size * ACTIVITY_XP.nutritionDay;
  const body = new Set(ds.bodyMetrics.map((m) => m.date)).size * ACTIVITY_XP.bodyMetricDay;
  return { workout, nutrition, body, total: workout + nutrition + body };
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
  progressPct: number;
}

export function levelForXp(xp: number): LevelInfo {
  const last = LEVELS[LEVELS.length - 1];
  if (xp >= last.xp) {
    const extra = Math.floor((xp - last.xp) / XP_PER_LEVEL_AFTER_MAX);
    const start = last.xp + extra * XP_PER_LEVEL_AFTER_MAX;
    const next = start + XP_PER_LEVEL_AFTER_MAX;
    return { level: last.level + extra, title: last.title, xp, levelStartXp: start, nextLevelXp: next, progressPct: ((xp - start) / (next - start)) * 100 };
  }
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return { level: cur.level, title: cur.title, xp, levelStartXp: cur.xp, nextLevelXp: next.xp, progressPct: ((xp - cur.xp) / (next.xp - cur.xp)) * 100 };
}

export interface TitleInfo {
  title: string;
  source: string;
  unlocked: boolean;
}

export function titles(level: number, rules: AchievementRule[], unlocked: UnlockedAchievement[]): TitleInfo[] {
  const earned = new Set(unlocked.map((u) => ruleIdOf(u.achievement_id)));
  const out: TitleInfo[] = LEVELS.map((l) => ({ title: l.title, source: `Reach level ${l.level}`, unlocked: level >= l.level }));
  for (const r of rules) {
    if (!r.title_reward || !r.enabled) continue;
    out.push({ title: r.title_reward, source: `Unlock “${r.name}”`, unlocked: earned.has(r.rule_id) });
  }
  return out;
}

/** Default rule set, written to achievement_rules.csv only when that file is missing. */
export const DEFAULT_RULES: AchievementRule[] = [
  r('first_workout', 'First Rep', 'Workouts', 'bronze', 'lifetime', 'workout_days', 1, 50, '', 'Complete your first workout.', 'dumbbell'),
  r('workouts_10', 'Ten Down', 'Workouts', 'silver', 'lifetime', 'workout_days', 10, 150, '', 'Complete 10 workouts.', 'dumbbell'),
  r('workouts_50', 'Half Century', 'Workouts', 'gold', 'lifetime', 'workout_days', 50, 400, '', 'Complete 50 workouts.', 'medal'),
  r('workouts_100', 'Centurion', 'Workouts', 'platinum', 'lifetime', 'workout_days', 100, 1000, 'Unstoppable', 'Complete 100 workouts.', 'crown'),
  r('week_four', 'Full Week', 'Weekly', 'silver', 'weekly', 'workout_days', 4, 75, '', 'Train on 4 different days in one week.', 'calendar-check'),
  r('week_balanced', 'Built to Recover', 'Weekly', 'bronze', 'weekly', 'balanced_week', 1, 40, '', 'Train 3–5 days in a week while keeping rest days for recovery.', 'battery-charging'),
  r('protein_week', 'Protein Week', 'Weekly', 'bronze', 'weekly', 'protein_target_days', 5, 50, '', 'Hit your protein target on 5 days in one week.', 'beef'),
  r('calorie_week', 'Dialed In', 'Weekly', 'bronze', 'weekly', 'calorie_target_days', 5, 50, '', 'Land within ±10% of your calorie target on 5 days in one week.', 'target'),
  r('month_twelve', 'Monthly Grind', 'Monthly', 'gold', 'monthly', 'workout_days', 12, 200, '', 'Train on 12 days in a calendar month.', 'calendar-range'),
  r('month_tracking', 'Logged Month', 'Monthly', 'silver', 'monthly', 'tracking_days', 25, 150, '', 'Track something on 25 days in a calendar month.', 'notebook-pen'),
  r('year_150', 'Year of Iron', 'Yearly', 'platinum', 'yearly', 'workout_days', 150, 1500, '', 'Train on 150 days in a calendar year.', 'mountain'),
  r('streak_7', 'Locked In', 'Consistency', 'bronze', 'lifetime', 'tracking_streak', 7, 100, '', 'Maintain a 7-day tracking streak.', 'flame'),
  r('streak_30', 'Thirty Strong', 'Consistency', 'gold', 'lifetime', 'tracking_streak', 30, 400, 'Consistency King', 'Maintain a 30-day tracking streak.', 'flame'),
  r('tracking_90', 'Ninety Days', 'Consistency', 'platinum', 'lifetime', 'tracking_days', 90, 800, '', 'Track consistently on 90 different days.', 'calendar-heart'),
  r('first_meal', 'Fuel Logged', 'Nutrition', 'bronze', 'lifetime', 'nutrition_days', 1, 25, '', 'Log your first meal.', 'utensils'),
  r('protein_7', 'Protein Streak', 'Nutrition', 'silver', 'lifetime', 'protein_target_streak', 7, 200, 'Protein Machine', 'Achieve your protein target 7 days in a row.', 'beef'),
  r('first_pr', 'New Best', 'Records', 'bronze', 'lifetime', 'personal_records', 1, 50, '', 'Set your first personal record.', 'trophy'),
  r('pr_5', 'Record Breaker', 'Records', 'silver', 'lifetime', 'personal_records', 5, 200, '', 'Set 5 personal records.', 'trophy'),
  r('pr_25', 'Record Machine', 'Records', 'gold', 'lifetime', 'personal_records', 25, 500, '', 'Set 25 personal records.', 'zap'),
  r('volume_10k', 'Ten Tonnes', 'Records', 'bronze', 'lifetime', 'total_volume_kg', 10000, 100, '', 'Lift 10,000 kg of total volume.', 'weight'),
  r('volume_100k', 'Hundred Tonnes', 'Records', 'gold', 'lifetime', 'total_volume_kg', 100000, 500, 'Heavy Metal', 'Lift 100,000 kg of total volume.', 'weight'),
  r('first_weigh_in', 'Baseline', 'Body', 'bronze', 'lifetime', 'body_logs', 1, 25, '', 'Record your first body measurement.', 'scale'),
  r('body_logs_12', 'Check-in Habit', 'Body', 'silver', 'lifetime', 'body_logs', 12, 100, '', 'Record 12 body check-ins.', 'ruler'),
  r('goal_halfway', 'Halfway There', 'Body', 'silver', 'lifetime', 'goal_progress_pct', 50, 200, '', 'Reach 50% of the way to your target weight.', 'trending-up'),
  r('goal_reached', 'Goal Reached', 'Body', 'platinum', 'lifetime', 'goal_progress_pct', 100, 750, '', 'Reach your target weight.', 'badge-check'),
];

function r(
  rule_id: string,
  name: string,
  category: string,
  level: AchievementRule['level'],
  period: AchievementPeriod,
  metric: string,
  threshold: number,
  xp: number,
  title_reward: string,
  description: string,
  icon: string,
): AchievementRule {
  return { rule_id, name, category, level, period, metric, threshold, xp, title_reward, description, icon, enabled: true };
}

