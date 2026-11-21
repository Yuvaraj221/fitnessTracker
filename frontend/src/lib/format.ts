import { toUTC, type ISODate } from '@forge/shared';

const nf = (dp: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 });

export function fmtNum(n: number | null | undefined, dp = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return nf(dp).format(n);
}

/** 1,284 · 12.9K · 1.2M */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) < 10_000) return fmtNum(n, 0);
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtSigned(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = fmtNum(Math.abs(n), dp);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

const dateFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts });

export const fmtDate = (d: ISODate) => dateFmt({ month: 'short', day: 'numeric' }).format(toUTC(d));
export const fmtDateLong = (d: ISODate) => dateFmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(toUTC(d));
export const fmtDateMedium = (d: ISODate) => dateFmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(toUTC(d));
export const fmtWeekday = (d: ISODate) => dateFmt({ weekday: 'short' }).format(toUTC(d));

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/** "1 pieces" -> "1 piece" for countable units. */
export function fmtQuantity(q: number | null, unit: string): string {
  if (q == null) return '';
  const singular: Record<string, string> = { pieces: 'piece', servings: 'serving', slices: 'slice' };
  return `${fmtNum(q, 1)} ${q === 1 && singular[unit] ? singular[unit] : unit}`;
}
