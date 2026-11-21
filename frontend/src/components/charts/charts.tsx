// Chart building blocks. Spec: bars ≤24px with 4px rounded data-ends, 2px
// lines, ≥8px markers with a surface ring, hairline solid grid, one y-axis,
// legend for ≥2 series, hover tooltip everywhere, and a table view.

import { BarChart3, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtCompact, fmtNum } from '../../lib/format';
import { Card, IconButton } from '../ui/primitives';

export const CHART = {
  surface: '#131316',
  grid: '#222228',
  axis: '#72727c',
  brand: '#e2620f',
  protein: '#3987e5',
  carbs: '#e2620f',
  fats: '#199e70',
  electric: '#3987e5',
  target: '#a3a3ad',
};

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

interface TableSpec {
  columns: string[];
  rows: (string | number)[][];
}

/** Card wrapper with a chart/table toggle so data is never colour-only. */
export function ChartCard({
  title,
  subtitle,
  action,
  table,
  children,
  height = 240,
  empty,
  legend,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  table?: TableSpec;
  children: ReactNode;
  height?: number;
  empty?: ReactNode;
  legend?: SeriesDef[];
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card
      title={title}
      subtitle={subtitle}
      action={
        <>
          {action}
          {table && !empty && (
            <IconButton
              size="sm"
              icon={asTable ? BarChart3 : Table2}
              label={asTable ? `Show ${title} as chart` : `Show ${title} as table`}
              onClick={() => setAsTable((v) => !v)}
            />
          )}
        </>
      }
    >
      {legend && legend.length > 1 && !empty && !asTable && (
        <ul className="-mt-1 mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
          {legend.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-ink-2">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {empty ? (
        <div className="flex items-center justify-center" style={{ minHeight: height }}>
          {empty}
        </div>
      ) : asTable && table ? (
        <div className="scrollbar-thin overflow-auto" style={{ maxHeight: height + 24 }}>
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-surface text-ink-3">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-1.5 font-medium ${i ? 'text-right' : ''}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular text-ink-2">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className={`py-1.5 ${j ? 'text-right' : ''}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </Card>
  );
}

function TooltipBox({ active, payload, label, unit, labelFormatter, dp = 0 }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-overlay px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-ink">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload
        .filter((p: any) => p.value != null)
        .map((p: any) => (
          <p key={p.dataKey} className="flex items-center gap-2 text-ink-2 tabular">
            <span className="size-2 rounded-full" style={{ background: p.color ?? p.fill }} aria-hidden />
            <span>{p.name}</span>
            <span className="ml-auto pl-3 font-medium text-ink">
              {fmtNum(p.value, dp)} {unit}
            </span>
          </p>
        ))}
    </div>
  );
}

export function BarSeriesChart({
  data,
  xKey,
  series,
  unit,
  target,
  targetLabel,
  xFormatter,
  tooltipLabel,
  dp = 0,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesDef;
  unit?: string;
  target?: number | null;
  targetLabel?: string;
  xFormatter?: (v: string) => string;
  tooltipLabel?: (v: string) => string;
  dp?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} minTickGap={12} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={44} tickFormatter={(v) => fmtCompact(v)} allowDecimals={false} />
        <Tooltip cursor={{ fill: '#ffffff08' }} content={<TooltipBox unit={unit} labelFormatter={tooltipLabel ?? xFormatter} dp={dp} />} />
        {target != null && target > 0 && (
          // Unlabelled on bar charts (the card subtitle names the target) so it never collides with bars.
          <ReferenceLine y={target} stroke={CHART.target} strokeOpacity={0.55} ifOverflow="extendDomain" aria-label={targetLabel ?? 'Target'} />
        )}
        <Bar dataKey={series.key} name={series.label} fill={series.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeriesChart({
  data,
  xKey,
  series,
  unit,
  target,
  targetLabel,
  xFormatter,
  dp = 1,
  domainPadding = 0.5,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesDef[];
  unit?: string;
  target?: number | null;
  targetLabel?: string;
  xFormatter?: (v: string) => string;
  dp?: number;
  domainPadding?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} minTickGap={16} interval="preserveStartEnd" />
        <YAxis
          {...axisProps}
          width={44}
          domain={[(min: number) => Math.floor(min - domainPadding), (max: number) => Math.ceil(max + domainPadding)]}
          allowDecimals={false}
          tickFormatter={(v) => fmtNum(v, 0)}
        />
        <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<TooltipBox unit={unit} labelFormatter={xFormatter} dp={dp} />} />
        {target != null && (
          <ReferenceLine
            y={target}
            stroke={CHART.target}
            strokeOpacity={0.55}
            ifOverflow="extendDomain"
            label={{ value: targetLabel ?? 'Target', position: 'insideBottomRight', fill: CHART.axis, fontSize: 11 }}
          />
        )}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls
            dot={{ r: 4, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars in plain HTML — for ranked categories like muscle groups. */
export function RankedBars({ rows, color = CHART.brand, unit }: { rows: { label: string; value: number }[]; color?: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="h-2.5 rounded-r-[4px] bg-raised" title={`${r.label}: ${r.value} ${unit ?? ''}`}>
            <span className="block h-full rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="w-8 text-right text-ink tabular">{fmtNum(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
