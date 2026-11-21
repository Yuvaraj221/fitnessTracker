import {
  todayISO,
  type BodyMetric,
  type Dataset,
  type MealEntry,
  type MutationResult,
  type Settings,
  type WorkoutWithExercises,
} from '@forge/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { api } from './client';
import type { AchievementOverview, BackupManifest, DataInfo } from './types';

export const keys = {
  workouts: ['workouts'] as const,
  meals: ['meals'] as const,
  body: ['body-metrics'] as const,
  settings: ['settings'] as const,
  achievements: ['achievements'] as const,
  backups: ['backups'] as const,
  info: ['data-info'] as const,
};

export const useWorkouts = () => useQuery({ queryKey: keys.workouts, queryFn: () => api.get<WorkoutWithExercises[]>('/workouts') });
export const useMeals = () => useQuery({ queryKey: keys.meals, queryFn: () => api.get<MealEntry[]>('/meals') });
export const useBodyMetrics = () => useQuery({ queryKey: keys.body, queryFn: () => api.get<BodyMetric[]>('/body-metrics') });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>('/settings') });
export const useAchievements = () => useQuery({ queryKey: keys.achievements, queryFn: () => api.get<AchievementOverview>('/achievements') });
export const useBackups = () => useQuery({ queryKey: keys.backups, queryFn: () => api.get<BackupManifest[]>('/data/backups') });
export const useDataInfo = () => useQuery({ queryKey: keys.info, queryFn: () => api.get<DataInfo>('/data/info') });

/** All CSV-backed data as one memoised Dataset for analytics. */
export function useDataset() {
  const w = useWorkouts();
  const m = useMeals();
  const b = useBodyMetrics();
  const s = useSettings();
  const data = useMemo<Dataset | undefined>(
    () => (w.data && m.data && b.data && s.data ? { workouts: w.data, meals: m.data, bodyMetrics: b.data, settings: s.data } : undefined),
    [w.data, m.data, b.data, s.data],
  );
  const error = w.error ?? m.error ?? b.error ?? s.error;
  return { data, isLoading: !data && !error, error, refetch: () => Promise.all([w.refetch(), m.refetch(), b.refetch(), s.refetch()]) };
}

/** Today's date that rolls over at midnight while the app is open. */
export function useToday() {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const t = window.setInterval(() => setToday(todayISO()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return today;
}

interface ForgeMutationOptions {
  invalidate: readonly (readonly string[])[];
  success?: string | ((data: any) => string);
}

/**
 * Standard mutation: send to the API (which writes CSV), refresh affected
 * queries, then surface success, error and achievement-unlock notifications.
 */
export function useForgeMutation<TVars, TData = unknown>(fn: (vars: TVars) => Promise<MutationResult<TData>>, opts: ForgeMutationOptions) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await Promise.all([...opts.invalidate, keys.achievements, keys.info].map((k) => qc.invalidateQueries({ queryKey: k })));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result.data) : opts.success);
      const settings = qc.getQueryData<Settings>(keys.settings);
      if (result.unlocked.length && settings?.achievement_notifications !== false) {
        const shown = result.unlocked.slice(-3);
        for (const a of shown) toast.achievement(a.achievement_name, `${a.description} +${a.xp_awarded} XP`);
        if (result.unlocked.length > shown.length) toast.achievement(`${result.unlocked.length - shown.length} more unlocked`, 'See them in Achievements.');
      }
    },
    onError: (err: Error) => toast.error('That change wasn’t saved', err.message),
  });
}
