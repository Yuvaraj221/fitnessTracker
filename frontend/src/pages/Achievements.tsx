import { METRICS, ruleIdOf, type AchievementLevel, type RuleProgress } from '@forge/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BadgeCheck,
  BatteryCharging,
  Beef,
  CalendarCheck,
  CalendarHeart,
  CalendarRange,
  Crown,
  Dumbbell,
  Flame,
  Lock,
  Medal,
  Mountain,
  NotebookPen,
  Ruler,
  Scale,
  Target,
  TrendingUp,
  Trophy,
  Utensils,
  Weight,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { keys, useAchievements, useForgeMutation, useSettings } from '../api/hooks';
import { Select } from '../components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, ProgressBar, SectionTitle, Segmented } from '../components/ui/primitives';
import { cn } from '../lib/cn';
import { fmtCompact, fmtDate, fmtNum } from '../lib/format';

const ICONS: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  medal: Medal,
  crown: Crown,
  'calendar-check': CalendarCheck,
  'calendar-range': CalendarRange,
  'calendar-heart': CalendarHeart,
  'battery-charging': BatteryCharging,
  beef: Beef,
  target: Target,
  'notebook-pen': NotebookPen,
  mountain: Mountain,
  flame: Flame,
  utensils: Utensils,
  trophy: Trophy,
  zap: Zap,
  weight: Weight,
  scale: Scale,
  ruler: Ruler,
  'trending-up': TrendingUp,
  'badge-check': BadgeCheck,
};

/** Restrained metallic tones per tier. */
export const LEVEL_TONE: Record<AchievementLevel, { ring: string; fg: string; label: string }> = {
  bronze: { ring: '#9a6b47', fg: '#d29a6e', label: 'Bronze' },
  silver: { ring: '#7f8792', fg: '#c5ccd6', label: 'Silver' },
  gold: { ring: '#a7832a', fg: '#e5bd57', label: 'Gold' },
  platinum: { ring: '#4f8ea3', fg: '#9fdcef', label: 'Platinum' },
};

const PERIOD_LABEL = { lifetime: 'Lifetime', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' } as const;

function BadgeIcon({ icon, level, locked, size = 'md' }: { icon: string; level: AchievementLevel; locked: boolean; size?: 'sm' | 'md' }) {
  const Icon = ICONS[icon] ?? Award;
  const tone = LEVEL_TONE[level] ?? LEVEL_TONE.bronze;
  return (
    <span
      className={cn('relative flex shrink-0 items-center justify-center rounded-full border-2', size === 'md' ? 'size-12' : 'size-9')}
      style={{ borderColor: locked ? 'var(--color-line-strong)' : tone.ring, background: locked ? 'var(--color-raised)' : `${tone.ring}22` }}
      aria-hidden
    >
      <Icon className={size === 'md' ? 'size-5' : 'size-4'} style={{ color: locked ? 'var(--color-ink-3)' : tone.fg }} />
      {locked && (
        <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border border-line-strong bg-surface">
          <Lock className="size-2.5 text-ink-3" />
        </span>
      )}
    </span>
  );
}

function AchievementCard({ p }: { p: RuleProgress }) {
  const { rule } = p;
  const def = METRICS[rule.metric];
  const periodic = rule.period !== 'lifetime';
  const locked = !p.unlocked;
  const tone = LEVEL_TONE[rule.level] ?? LEVEL_TONE.bronze;
  const value = (n: number) => (def?.unit === 'kg' ? fmtCompact(n) : fmtNum(n, def?.unit === '%' ? 0 : 0));
  return (
    <li className={cn('flex flex-col rounded-[var(--radius-card)] border bg-surface p-4', locked ? 'border-line' : 'border-line-strong')}>
      <div className="flex items-start gap-3">
        <BadgeIcon icon={rule.icon} level={rule.level} locked={locked} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold', locked ? 'text-ink-2' : 'text-ink')}>{rule.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            <span style={{ color: locked ? undefined : tone.fg }}>{tone.label}</span> · {PERIOD_LABEL[rule.period]} · {rule.xp} XP
          </p>
        </div>
      </div>
      <p className="mt-3 flex-1 text-[13px] text-ink-2">{rule.description}</p>
      {rule.title_reward && <p className="mt-1 text-xs text-ink-3">Unlocks title “{rule.title_reward}”</p>}
      <div className="mt-3">
        {!periodic && p.unlocked ? (
          <p className="text-xs font-medium text-good">Unlocked {p.lastUnlocked && fmtDate(p.lastUnlocked.unlocked_date)}</p>
        ) : (
          <>
            <div className="mb-1 flex justify-between text-xs text-ink-3 tabular">
              <span>{periodic ? `This ${rule.period.replace('ly', '')}` : 'Progress'}</span>
              <span>
                {value(Math.min(p.current, rule.threshold))} / {value(rule.threshold)} {def?.unit === 'week' ? '' : def?.unit}
              </span>
            </div>
            <ProgressBar value={p.current} max={rule.threshold} color={p.earnedThisPeriod ? 'var(--color-good)' : 'var(--color-brand)'} label={`${rule.name} progress`} />
            {periodic && (
              <p className="mt-1.5 text-xs text-ink-3">
                {p.timesEarned ? (
                  <>
                    Earned <span className="font-medium text-ink-2">{p.timesEarned}×</span>
                    {p.earnedThisPeriod && <span className="text-good"> · done this {rule.period.replace('ly', '')}</span>}
                  </>
                ) : (
                  'Not earned yet'
                )}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

type Filter = 'all' | 'unlocked' | 'locked';

export function AchievementsPage() {
  const { data, isLoading, error, refetch } = useAchievements();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState('');
  const markedSeen = useRef(false);

  useEffect(() => {
    if (data?.unseen && !markedSeen.current) {
      markedSeen.current = true;
      api.send('POST', '/achievements/seen').then(() => {
        qc.invalidateQueries({ queryKey: keys.achievements });
        qc.invalidateQueries({ queryKey: keys.settings });
      });
    }
  }, [data?.unseen, qc]);

  const setTitle = useForgeMutation((title: string) => api.send('PUT', '/settings', { active_title: title }), {
    invalidate: [keys.settings],
    success: (s: { active_title: string }) => (s.active_title ? `Title set to “${s.active_title}”` : 'Title reset to your level title'),
  });

  const categories = useMemo(() => [...new Set(data?.rules.map((r) => r.category) ?? [])], [data]);
  const showLocked = settings?.show_locked_achievements !== false;
  const items = useMemo(
    () =>
      (data?.progress ?? []).filter((p) => {
        if (category && p.rule.category !== category) return false;
        if (filter === 'unlocked' && !p.unlocked) return false;
        if (filter === 'locked' && p.unlocked) return false;
        if (!showLocked && !p.unlocked) return false;
        return true;
      }),
    [data, filter, category, showLocked],
  );

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <PageSkeleton />;

  const { level, xp } = data;
  const unlockedRules = data.progress.filter((p) => p.unlocked).length;
  const rulesById = new Map(data.rules.map((r) => [r.rule_id, r]));

  return (
    <div>
      <PageHeader title="Achievements" description="Rules live in achievement_rules.csv; every unlock is recorded once in achievements.csv." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-brand/40 bg-brand-soft">
              <span className="text-[10px] font-semibold tracking-widest text-brand uppercase">Level</span>
              <span className="text-3xl leading-none font-bold text-ink tabular">{level.level}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-3">Current title</p>
              <p className="text-xl font-semibold tracking-tight">{data.activeTitle}</p>
              <div className="mt-3 mb-1 flex justify-between text-xs text-ink-3 tabular">
                <span>{fmtNum(level.xp)} XP</span>
                <span>
                  {fmtNum(level.nextLevelXp - level.xp)} XP to level {level.level + 1}
                </span>
              </div>
              <ProgressBar value={level.xp - level.levelStartXp} max={level.nextLevelXp - level.levelStartXp} label="Progress to next level" />
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px] sm:grid-cols-4">
            {[
              ['Achievements', xp.achievements],
              ['Training days', xp.activity.workout],
              ['Nutrition logging', xp.activity.nutrition],
              ['Body check-ins', xp.activity.body],
            ].map(([label, v]) => (
              <div key={label as string}>
                <dt className="text-xs text-ink-3">{label}</dt>
                <dd className="font-medium tabular">+{fmtNum(v as number)} XP</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Titles" subtitle={`${data.titles.filter((t) => t.unlocked).length} of ${data.titles.length} unlocked`}>
          <Select
            aria-label="Active title"
            value={settings?.active_title ?? ''}
            onChange={(e) => setTitle.mutate(e.target.value)}
            disabled={setTitle.isPending}
          >
            <option value="">Use level title ({level.title})</option>
            {data.titles
              .filter((t) => t.unlocked)
              .map((t) => (
                <option key={t.title} value={t.title}>
                  {t.title}
                </option>
              ))}
          </Select>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {data.titles.map((t) => (
              <li
                key={t.title}
                title={t.source}
                className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-xs', t.unlocked ? 'border-line-strong text-ink' : 'border-line text-ink-3')}
              >
                {!t.unlocked && <Lock className="size-3" aria-hidden />}
                {t.title}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {data.unlocked.length > 0 && (
        <>
          <SectionTitle>Recently unlocked</SectionTitle>
          <ul className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
            {data.unlocked.slice(0, 10).map((u) => {
              const rule = rulesById.get(ruleIdOf(u.achievement_id));
              return (
                <li key={u.achievement_id} className="flex w-56 shrink-0 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3">
                  <BadgeIcon icon={rule?.icon ?? ''} level={u.achievement_level} locked={false} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{u.achievement_name}</p>
                    <p className="text-xs text-ink-3 tabular">
                      {fmtDate(u.unlocked_date)} · +{u.xp_awarded} XP
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SectionTitle
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Category" className="h-8 w-40 text-[13px]" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Segmented
              label="Achievement filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'unlocked', label: 'Unlocked' },
                { value: 'locked', label: 'Locked' },
              ]}
            />
          </div>
        }
      >
        Gallery · {unlockedRules}/{data.progress.length}
      </SectionTitle>
      {items.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((p) => (
            <AchievementCard key={p.rule.rule_id} p={p} />
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState icon={Trophy} title="No achievements match this filter" description={!showLocked ? 'Locked badges are hidden in Settings.' : undefined} />
        </Card>
      )}
      <p className="mt-6 text-xs text-ink-3">
        FORGE rewards consistency and recovery, not excess: training XP counts each day once, weekly badges cap at 5 training days, and calorie badges reward landing
        near your target — never under-eating.
      </p>
    </div>
  );
}
