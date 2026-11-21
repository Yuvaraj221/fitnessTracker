import type { Settings } from '@forge/shared';
import { useSettings } from '../api/hooks';
import { fmtNum } from './format';

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export interface Units {
  weight: 'kg' | 'lbs';
  length: 'cm' | 'in';
  /** kg -> display unit */
  w: (kg: number | null | undefined) => number | null;
  /** display unit -> kg */
  toKg: (v: number | null) => number | null;
  l: (cm: number | null | undefined) => number | null;
  toCm: (v: number | null) => number | null;
  fmtW: (kg: number | null | undefined, dp?: number) => string;
  fmtL: (cm: number | null | undefined, dp?: number) => string;
}

export function makeUnits(s?: Pick<Settings, 'weight_unit' | 'length_unit'>): Units {
  const weight = s?.weight_unit ?? 'kg';
  const length = s?.length_unit ?? 'cm';
  const w = (kg: number | null | undefined) => (kg == null ? null : weight === 'lbs' ? kg / KG_PER_LB : kg);
  const l = (cm: number | null | undefined) => (cm == null ? null : length === 'in' ? cm / CM_PER_IN : cm);
  return {
    weight,
    length,
    w,
    l,
    toKg: (v) => (v == null ? null : weight === 'lbs' ? Math.round(v * KG_PER_LB * 1000) / 1000 : v),
    toCm: (v) => (v == null ? null : length === 'in' ? Math.round(v * CM_PER_IN * 100) / 100 : v),
    fmtW: (kg, dp = 1) => (kg == null ? '—' : `${fmtNum(w(kg), dp)} ${weight}`),
    fmtL: (cm, dp = 1) => (cm == null ? '—' : `${fmtNum(l(cm), dp)} ${length}`),
  };
}

export function useUnits(): Units {
  const { data } = useSettings();
  return makeUnits(data);
}
