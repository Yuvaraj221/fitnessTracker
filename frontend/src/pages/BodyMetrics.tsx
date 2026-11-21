import {
  currentWeight,
  goalProgressPct,
  isSampleId,
  MEASUREMENT_KEYS,
  MEASUREMENT_LABELS,
  sortedMetrics,
  startingWeight,
  type BodyMetric,
} from '@forge/shared';
import { Flag, Pencil, Percent, Plus, Ruler, Scale, Target, Trash2, TrendingDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { keys, useDataset, useForgeMutation, useToday } from '../api/hooks';
import { ChartCard, CHART, LineSeriesChart, type SeriesDef } from '../components/charts/charts';
import { ConfirmDialog } from '../components/ui/overlay';
import { Button, Card, EmptyState, ErrorState, IconButton, PageHeader, PageSkeleton, ProgressBar, SampleBadge, Segmented, StatTile } from '../components/ui/primitives';
import { BodyMetricModal } from '../features/body/BodyMetricModal';
import { fmtDate, fmtDateMedium, fmtNum, fmtSigned } from '../lib/format';
import { rangeDates, RANGE_LABELS, type RangeKey } from '../lib/ranges';
import { useUnits } from '../lib/units';

/** Dark-mode categorical slots in fixed order (validated adjacent-pair CVD separation). */
export const MEASURE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const RANGES: RangeKey[] = ['7d', '30d', '90d', '6m', '1y', 'all'];

export function BodyMetricsPage() {
  const { data: ds, isLoading, error, refetch } = useDataset();
  const today = useToday();
  const u = useUnits();
  const [range, setRange] = useState<RangeKey>('90d');
  const [modal, setModal] = useState<{ entry: BodyMetric | null } | null>(null);
  const [deleting, setDeleting] = useState<BodyMetric | null>(null);

  const remove = useForgeMutation((id: string) => api.send('DELETE', `/body-metrics/${id}`), { invalidate: [keys.body], success: 'Measurement deleted' });

  const view = useMemo(() => {
    if (!ds) return null;
    const all = sortedMetrics(ds.bodyMetrics);
    const { from, to } = rangeDates(range, today, all[0]?.date);
    const inRange = all.filter((m) => m.date >= from && m.date <= to);
    const start = startingWeight(ds.bodyMetrics, ds.settings);
    const current = currentWeight(ds.bodyMetrics);
    const target = ds.settings.target_weight_kg;
    const measures = MEASUREMENT_KEYS.filter((k) => all.some((m) => m[k] != null));
    const series: SeriesDef[] = measures.map((k) => ({ key: k, label: MEASUREMENT_LABELS[k], color: MEASURE_COLORS[MEASUREMENT_KEYS.indexOf(k)] }));
    return {
      all,
      start,
      current,
      target,
      progress: goalProgressPct(start, current, target),
      weight: inRange.filter((m) => m.weight_kg != null).map((m) => ({ date: m.date, weight: u.w(m.weight_kg) })),
      fat: inRange.filter((m) => m.body_fat_percentage != null).map((m) => ({ date: m.date, fat: m.body_fat_percentage })),
      // Measurements differ in scale (arm ≈ 35 cm, chest ≈ 105 cm), so plot the change
      // from each one's first reading in the range on one shared axis.
      measureRows: (() => {
        const base = Object.fromEntries(measures.map((k) => [k, inRange.find((m) => m[k] != null)?.[k] ?? null]));
        return inRange
          .filter((m) => measures.some((k) => m[k] != null))
          .map((m) => ({
            date: m.date,
            ...Object.fromEntries(measures.map((k) => [k, m[k] != null && base[k] != null ? u.l(m[k]! - base[k]!) : null])),
          }));
      })(),
      series,
      first: Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, all.find((m) => m[k] != null)?.[k] ?? null])),
      last: Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, [...all].reverse().find((m) => m[k] != null)?.[k] ?? null])),
    };
  }, [ds, range, today, u]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !ds || !view) return <PageSkeleton />;
  const change = view.start != null && view.current != null ? view.current - view.start : null;
  const toGo = view.target != null && view.current != null ? view.target - view.current : null;

  return (
    <div>
      <PageHeader
        title="Body Metrics"
        description="Weight, body fat and measurements from body_metrics.csv."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setModal({ entry: null })}>
            Log measurement
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Current weight" icon={Scale} value={fmtNum(u.w(view.current), 1)} unit={u.weight} />
        <StatTile label="Starting weight" icon={Flag} value={fmtNum(u.w(view.start), 1)} unit={u.weight} hint={ds.settings.starting_weight_kg == null ? 'first weigh-in' : 'from settings'} />
        <StatTile label="Target weight" icon={Target} value={fmtNum(u.w(view.target), 1)} unit={view.target != null ? u.weight : undefined} hint={view.target == null ? 'Set one in Settings' : toGo != null ? `${fmtNum(Math.abs(u.w(toGo)!), 1)} ${u.weight} to go` : undefined} />
        <StatTile label="Total change" icon={TrendingDown} value={change == null ? '—' : fmtSigned(u.w(change), 1)} unit={change == null ? undefined : u.weight} />
      </div>

      {view.progress != null && (
        <Card className="mt-3" bodyClassName="py-4">
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="text-ink-2">Progress to target</span>
            <span className="font-medium tabular">{fmtNum(view.progress)}%</span>
          </div>
          <ProgressBar value={view.progress} max={100} color="var(--color-good)" label="Progress to target weight" />
          <p className="mt-2 text-xs text-ink-3 tabular">
            {u.fmtW(view.start)} → {u.fmtW(view.current)} → {u.fmtW(view.target)}
          </p>
        </Card>
      )}

      <div className="mt-6 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Trends</h2>
        <Segmented label="Chart range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Weight"
          subtitle={view.target != null ? `Target line at ${u.fmtW(view.target)}` : u.weight}
          empty={!view.weight.length && <EmptyState compact icon={Scale} title="No weigh-ins in this range" />}
          table={{ columns: ['Date', u.weight], rows: view.weight.map((r) => [fmtDate(r.date), fmtNum(r.weight, 1)]) }}
        >
          <LineSeriesChart data={view.weight} xKey="date" series={[{ key: 'weight', label: 'Weight', color: CHART.electric }]} unit={u.weight} target={u.w(view.target)} xFormatter={fmtDate} />
        </ChartCard>
        <ChartCard
          title="Body fat"
          subtitle="Percent"
          empty={!view.fat.length && <EmptyState compact icon={Percent} title="No body fat readings in this range" />}
          table={{ columns: ['Date', '%'], rows: view.fat.map((r) => [fmtDate(r.date), fmtNum(r.fat, 1)]) }}
        >
          <LineSeriesChart data={view.fat} xKey="date" series={[{ key: 'fat', label: 'Body fat', color: CHART.fats }]} unit="%" xFormatter={fmtDate} />
        </ChartCard>
        <div className="lg:col-span-2">
          <ChartCard
            title="Measurements"
            subtitle={`Change since the first reading in this range, ${u.length}`}
            legend={view.series}
            empty={!view.measureRows.length && <EmptyState compact icon={Ruler} title="No measurements in this range" />}
            table={{
              columns: ['Date', ...view.series.map((s) => s.label)],
              rows: view.measureRows.map((r: Record<string, unknown>) => [fmtDate(r.date as string), ...view.series.map((s) => fmtSigned(r[s.key] as number | null, 1))]),
            }}
          >
            <LineSeriesChart data={view.measureRows} xKey="date" series={view.series} unit={u.length} xFormatter={fmtDate} domainPadding={0.5} />
          </ChartCard>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Starting vs current</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {MEASUREMENT_KEYS.map((k) => {
          const a = view.first[k];
          const b = view.last[k];
          return (
            <div key={k} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <p className="text-[13px] text-ink-2">{MEASUREMENT_LABELS[k]}</p>
              <p className="mt-1 text-lg font-semibold tabular">{u.fmtL(b)}</p>
              <p className="text-xs text-ink-3 tabular">{a != null && b != null ? `${fmtSigned(u.l(b - a), 1)} since ${u.fmtL(a)}` : 'Not tracked yet'}</p>
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 mb-3 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">History</h2>
      <Card bodyClassName="p-0">
        {view.all.length === 0 ? (
          <EmptyState icon={Scale} title="No measurements yet" description="Log your weight to set a baseline." action={<Button variant="primary" icon={Plus} onClick={() => setModal({ entry: null })}>Log measurement</Button>} />
        ) : (
          <div className="scrollbar-thin relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-xs text-ink-3">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 text-right font-medium">Weight</th>
                  <th className="px-3 py-2.5 text-right font-medium">Body fat</th>
                  {MEASUREMENT_KEYS.map((k) => (
                    <th key={k} className="px-3 py-2.5 text-right font-medium">
                      {MEASUREMENT_LABELS[k]}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-medium">Notes</th>
                  <th className="w-20 px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...view.all].reverse().map((m) => (
                  <tr key={m.metric_id} className="border-b border-line last:border-0 hover:bg-raised/40">
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDateMedium(m.date)}</td>
                    <td className="px-3 py-2 text-right">{m.weight_kg != null ? fmtNum(u.w(m.weight_kg), 1) : '—'}</td>
                    <td className="px-3 py-2 text-right">{m.body_fat_percentage != null ? `${fmtNum(m.body_fat_percentage, 1)}%` : '—'}</td>
                    {MEASUREMENT_KEYS.map((k) => (
                      <td key={k} className="px-3 py-2 text-right text-ink-2">
                        {m[k] != null ? fmtNum(u.l(m[k]), 1) : '—'}
                      </td>
                    ))}
                    <td className="max-w-48 truncate px-3 py-2 text-ink-3">{isSampleId(m.metric_id) ? <SampleBadge /> : m.notes}</td>
                    <td className="px-2 py-1">
                      <div className="flex justify-end">
                        <IconButton size="sm" icon={Pencil} label={`Edit measurement from ${fmtDate(m.date)}`} onClick={() => setModal({ entry: m })} />
                        <IconButton size="sm" icon={Trash2} tone="danger" label={`Delete measurement from ${fmtDate(m.date)}`} onClick={() => setDeleting(m)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BodyMetricModal open={!!modal} onClose={() => setModal(null)} entry={modal?.entry ?? null} defaultDate={today} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.metric_id).catch(() => undefined);
          setDeleting(null);
        }}
        title="Delete measurement?"
        body={deleting && <>The body measurement from <strong className="text-ink">{fmtDateMedium(deleting.date)}</strong> will be removed. A backup is saved first.</>}
        confirmLabel="Delete measurement"
      />
    </div>
  );
}
