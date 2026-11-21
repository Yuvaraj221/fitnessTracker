import { addDays, type ISODate } from '@forge/shared';

export type RangeKey = '7d' | '30d' | '90d' | '6m' | '1y' | 'all';

export const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': '7D',
  '30d': '30D',
  '90d': '3M',
  '6m': '6M',
  '1y': '1Y',
  all: 'All',
};

const DAYS: Record<Exclude<RangeKey, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '6m': 182, '1y': 365 };

/** Inclusive window ending today. "all" starts at the earliest record. */
export function rangeDates(key: RangeKey, today: ISODate, earliest?: ISODate | null): { from: ISODate; to: ISODate } {
  if (key === 'all') return { from: earliest && earliest < today ? earliest : addDays(today, -29), to: today };
  return { from: addDays(today, -(DAYS[key] - 1)), to: today };
}
