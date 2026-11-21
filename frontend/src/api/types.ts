import type { AchievementRule, LevelInfo, RuleProgress, TitleInfo, UnlockedAchievement } from '@forge/shared';

export interface AchievementOverview {
  rules: AchievementRule[];
  unlocked: UnlockedAchievement[];
  progress: RuleProgress[];
  xp: { activity: { workout: number; nutrition: number; body: number; total: number }; achievements: number; total: number };
  level: LevelInfo;
  titles: TitleInfo[];
  activeTitle: string;
  unseen: number;
}

export interface BackupManifest {
  id: string;
  created_at: string;
  kind: 'manual' | 'auto';
  reason: string;
  files: string[];
  row_counts: Record<string, number>;
}

export interface DataInfo {
  dataDir: string;
  backupDir: string;
  tables: { name: string; file: string; rows: number }[];
  sampleRows: number;
}
