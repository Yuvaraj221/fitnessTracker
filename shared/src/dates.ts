// Timezone-safe helpers for YYYY-MM-DD calendar dates.
// Calendar dates are converted to UTC midnight internally so that day
// arithmetic never drifts across daylight-saving boundaries.

import type { ISODate } from './types';

const DAY_MS = 86_400_000;

export function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the machine's local timezone. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTC(new Date(toUTC(date).getTime() + n * DAY_MS));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / DAY_MS);
}

/** Monday of the ISO week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  const d = toUTC(date);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

export function endOfWeek(date: ISODate): ISODate {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const d = toUTC(startOfMonth(date));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return addDays(fromUTC(d), -1);
}

export function startOfYear(date: ISODate): ISODate {
  return `${date.slice(0, 4)}-01-01`;
}

export function endOfYear(date: ISODate): ISODate {
  return `${date.slice(0, 4)}-12-31`;
}

/** ISO-8601 week key, e.g. 2026-W47. */
export function isoWeekKey(date: ISODate): string {
  const d = toUTC(date);
  const dow = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d.getTime() + (3 - dow) * DAY_MS);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.floor((thursday.getTime() - yearStart.getTime()) / DAY_MS / 7) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Inclusive list of dates from `from` to `to`. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function inRange(date: ISODate, from?: ISODate | null, to?: ISODate | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
