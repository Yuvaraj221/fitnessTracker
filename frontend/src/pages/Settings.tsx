import { currentWeight, type Settings } from '@forge/shared';
import { Archive, Database, Download, FileSpreadsheet, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, download } from '../api/client';
import { keys, useBackups, useBodyMetrics, useDataInfo, useForgeMutation, useSettings } from '../api/hooks';
import type { BackupManifest } from '../api/types';
import { Field, Input, NumberInput, numStr, parseNum, Toggle } from '../components/ui/form';
import { ConfirmDialog } from '../components/ui/overlay';
import { useToast } from '../components/ui/Toast';
import { Badge, Button, Card, ErrorState, IconButton, PageHeader, PageSkeleton, Segmented } from '../components/ui/primitives';
import { fmtNum } from '../lib/format';
import { makeUnits } from '../lib/units';

interface Draft {
  display_name: string;
  current_weight: string;
  starting_weight: string;
  target_weight: string;
  calorie_target: string;
  protein_target_g: string;
  carbs_target_g: string;
  fat_target_g: string;
  weekly_workout_target: string;
  weight_unit: Settings['weight_unit'];
  length_unit: Settings['length_unit'];
  achievement_notifications: boolean;
  show_locked_achievements: boolean;
}

function toDraft(s: Settings, current: number | null): Draft {
  const u = makeUnits(s);
  return {
    display_name: s.display_name,
    current_weight: numStr(u.w(current), 1),
    starting_weight: numStr(u.w(s.starting_weight_kg), 1),
    target_weight: numStr(u.w(s.target_weight_kg), 1),
    calorie_target: String(s.calorie_target),
    protein_target_g: String(s.protein_target_g),
    carbs_target_g: String(s.carbs_target_g),
    fat_target_g: String(s.fat_target_g),
    weekly_workout_target: String(s.weekly_workout_target),
    weight_unit: s.weight_unit,
    length_unit: s.length_unit,
    achievement_notifications: s.achievement_notifications,
    show_locked_achievements: s.show_locked_achievements,
  };
}

function validate(d: Draft) {
  const e: Partial<Record<keyof Draft, string>> = {};
  const range = (k: keyof Draft, min: number, max: number, required: boolean, msg: string) => {
    const n = parseNum(d[k] as string);
    if (n == null) {
      if (required) e[k] = 'Required';
    } else if (Number.isNaN(n) || n < min || n > max) e[k] = msg;
  };
  const wMax = d.weight_unit === 'lbs' ? 1100 : 500;
  const wMin = d.weight_unit === 'lbs' ? 45 : 20;
  range('current_weight', wMin, wMax, false, `Between ${wMin} and ${wMax}`);
  range('starting_weight', wMin, wMax, false, `Between ${wMin} and ${wMax}`);
  range('target_weight', wMin, wMax, false, `Between ${wMin} and ${wMax}`);
  range('calorie_target', 800, 10000, true, 'Between 800 and 10,000 kcal');
  range('protein_target_g', 0, 1000, true, 'Between 0 and 1,000 g');
  range('carbs_target_g', 0, 2000, true, 'Between 0 and 2,000 g');
  range('fat_target_g', 0, 1000, true, 'Between 0 and 1,000 g');
  const wk = parseNum(d.weekly_workout_target);
  if (wk == null || Number.isNaN(wk) || wk < 1 || wk > 7 || !Number.isInteger(wk)) e.weekly_workout_target = 'Whole number from 1 to 7';
  return e;
}

export function SettingsPage() {
  const { data: settings, isLoading, error, refetch } = useSettings();
  const { data: metrics } = useBodyMetrics();
  const current = metrics ? currentWeight(metrics) : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const baseline = useRef('');

  useEffect(() => {
    if (settings && metrics) {
      const d = toDraft(settings, current);
      baseline.current = JSON.stringify(d);
      setDraft(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, metrics]);

  useEffect(() => {
    if (window.location.hash === '#targets') document.getElementById('targets')?.scrollIntoView({ block: 'start' });
  }, [draft === null]);

  const save = useForgeMutation((body: Record<string, unknown>) => api.send<Settings>('PUT', '/settings', body), {
    invalidate: [keys.settings, keys.body],
    success: 'Settings saved to user_settings.csv',
  });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !settings || !draft) return <PageSkeleton />;

  const errors = submitted ? validate(draft) : {};
  const dirty = JSON.stringify(draft) !== baseline.current;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  /** Switching units converts what's already typed so values keep their meaning. */
  const switchWeightUnit = (unit: Draft['weight_unit']) => {
    if (unit === draft.weight_unit) return;
    const from = makeUnits({ weight_unit: draft.weight_unit, length_unit: 'cm' });
    const to = makeUnits({ weight_unit: unit, length_unit: 'cm' });
    const conv = (s: string) => {
      const n = parseNum(s);
      return n == null || Number.isNaN(n) ? s : numStr(to.w(from.toKg(n)), 1);
    };
    set({ weight_unit: unit, current_weight: conv(draft.current_weight), starting_weight: conv(draft.starting_weight), target_weight: conv(draft.target_weight) });
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate(draft)).length) return;
    const u = makeUnits({ weight_unit: draft.weight_unit, length_unit: draft.length_unit });
    const body: Record<string, unknown> = {
      display_name: draft.display_name.trim() || 'Athlete',
      starting_weight_kg: u.toKg(parseNum(draft.starting_weight)),
      target_weight_kg: u.toKg(parseNum(draft.target_weight)),
      calorie_target: Math.round(parseNum(draft.calorie_target)!),
      protein_target_g: parseNum(draft.protein_target_g),
      carbs_target_g: parseNum(draft.carbs_target_g),
      fat_target_g: parseNum(draft.fat_target_g),
      weekly_workout_target: parseNum(draft.weekly_workout_target),
      weight_unit: draft.weight_unit,
      length_unit: draft.length_unit,
      achievement_notifications: draft.achievement_notifications,
      show_locked_achievements: draft.show_locked_achievements,
    };
    const baselineDraft = JSON.parse(baseline.current) as Draft;
    const cw = u.toKg(parseNum(draft.current_weight));
    const cwBefore = makeUnits({ weight_unit: baselineDraft.weight_unit, length_unit: 'cm' }).toKg(parseNum(baselineDraft.current_weight));
    if (cw != null && (cwBefore == null || Math.abs(cw - cwBefore) > 0.01)) body.current_weight_kg = cw;
    await save.mutateAsync(body);
    setSubmitted(false);
  };

  const p = parseNum(draft.protein_target_g) || 0;
  const c = parseNum(draft.carbs_target_g) || 0;
  const f = parseNum(draft.fat_target_g) || 0;
  const macroKcal = p * 4 + c * 4 + f * 9;
  const kcal = parseNum(draft.calorie_target) || 0;

  return (
    <div>
      <PageHeader title="Settings" description="Goals and preferences are stored in user_settings.csv." />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Profile & body goals" subtitle="Current weight is saved as today’s entry in body_metrics.csv.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Display name" className="sm:col-span-2">
                {(id) => <Input id={id} value={draft.display_name} maxLength={60} onChange={(e) => set({ display_name: e.target.value })} />}
              </Field>
              <Field label="Current body weight" optional error={errors.current_weight}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} suffix={draft.weight_unit} invalid={!!errors.current_weight} value={draft.current_weight} onChange={(e) => set({ current_weight: e.target.value })} />}
              </Field>
              <Field label="Target body weight" optional error={errors.target_weight}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} suffix={draft.weight_unit} invalid={!!errors.target_weight} value={draft.target_weight} onChange={(e) => set({ target_weight: e.target.value })} />}
              </Field>
              <Field label="Starting weight" optional error={errors.starting_weight} hint="Leave empty to use your first weigh-in." className="sm:col-span-2">
                {(id, d) => <NumberInput id={id} aria-describedby={d} suffix={draft.weight_unit} invalid={!!errors.starting_weight} value={draft.starting_weight} onChange={(e) => set({ starting_weight: e.target.value })} />}
              </Field>
            </div>
          </Card>

          <Card title="Daily nutrition targets" subtitle="Used for progress rings, analytics and nutrition badges.">
            <div id="targets" className="grid scroll-mt-24 grid-cols-2 gap-4">
              <Field label="Calories" error={errors.calorie_target} className="col-span-2">
                {(id, d) => <NumberInput id={id} aria-describedby={d} suffix="kcal" invalid={!!errors.calorie_target} value={draft.calorie_target} onChange={(e) => set({ calorie_target: e.target.value })} />}
              </Field>
              <Field label="Protein" error={errors.protein_target_g}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} suffix="g" invalid={!!errors.protein_target_g} value={draft.protein_target_g} onChange={(e) => set({ protein_target_g: e.target.value })} />}
              </Field>
              <Field label="Carbohydrates" error={errors.carbs_target_g}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} suffix="g" invalid={!!errors.carbs_target_g} value={draft.carbs_target_g} onChange={(e) => set({ carbs_target_g: e.target.value })} />}
              </Field>
              <Field label="Fats" error={errors.fat_target_g}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} suffix="g" invalid={!!errors.fat_target_g} value={draft.fat_target_g} onChange={(e) => set({ fat_target_g: e.target.value })} />}
              </Field>
              <div className="self-end pb-2 text-xs text-ink-3 tabular">
                Macros ≈ {fmtNum(macroKcal)} kcal{kcal > 0 && ` (${fmtNum((macroKcal / kcal) * 100)}% of target)`}
              </div>
            </div>
          </Card>

          <Card title="Training">
            <Field label="Weekly workout target" error={errors.weekly_workout_target} hint="3–5 training days with rest between them is a sustainable range for most people.">
              {(id, d) => <NumberInput id={id} aria-describedby={d} inputMode="numeric" suffix="days" invalid={!!errors.weekly_workout_target} value={draft.weekly_workout_target} onChange={(e) => set({ weekly_workout_target: e.target.value })} />}
            </Field>
          </Card>

          <Card title="Units & achievements" subtitle="Data is always stored in kg and cm; units only change the display.">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium">Weight</span>
                <Segmented label="Weight unit" size="md" value={draft.weight_unit} onChange={switchWeightUnit} options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lbs', label: 'Pounds' }]} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium">Length</span>
                <Segmented label="Length unit" size="md" value={draft.length_unit} onChange={(v) => set({ length_unit: v })} options={[{ value: 'cm', label: 'Centimetres' }, { value: 'in', label: 'Inches' }]} />
              </div>
              <Toggle label="Unlock notifications" description="Show a notification when you earn an achievement." checked={draft.achievement_notifications} onChange={(v) => set({ achievement_notifications: v })} />
              <Toggle label="Show locked badges" description="Display achievements you haven’t earned yet in the gallery." checked={draft.show_locked_achievements} onChange={(v) => set({ show_locked_achievements: v })} />
            </div>
          </Card>
        </div>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="flex items-center gap-3 rounded-xl border border-line-strong bg-overlay/95 px-3 py-2 shadow-xl backdrop-blur-sm">
            <span className="text-xs text-ink-3">{Object.keys(errors).length ? <span className="text-bad">Fix the highlighted fields</span> : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
            <Button size="sm" disabled={!dirty} onClick={() => { setDraft(JSON.parse(baseline.current)); setSubmitted(false); }}>
              Revert
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={!dirty} loading={save.isPending}>
              Save settings
            </Button>
          </div>
        </div>
      </form>

      <DataSection />
    </div>
  );
}

function DataSection() {
  const { data: info } = useDataInfo();
  const { data: backups } = useBackups();
  const fileInput = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState<BackupManifest | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [removeSample, setRemoveSample] = useState(false);
  const all = [keys.workouts, keys.meals, keys.body, keys.settings, keys.backups];

  const backup = useForgeMutation(() => api.send('POST', '/data/backups', { reason: 'manual backup' }), { invalidate: [keys.backups], success: 'Backup created' });
  const restore = useForgeMutation((id: string) => api.send('POST', `/data/backups/${encodeURIComponent(id)}/restore`), {
    invalidate: all,
    success: 'Backup restored. Your previous data was backed up first.',
  });
  const importZip = useForgeMutation((file: File) => api.upload('/data/import', file), { invalidate: all, success: 'Import complete. Your previous data was backed up first.' });
  const sample = useForgeMutation(() => api.send<{ removed: number }>('DELETE', '/data/sample-data'), {
    invalidate: all,
    success: (r: { removed: number }) => `Removed ${r.removed} sample records`,
  });

  const recent = useMemo(() => (backups ?? []).slice(0, 8), [backups]);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const run = async (fn: () => Promise<void>, spinner = true) => {
    if (spinner) setExporting(true);
    try {
      await fn();
    } catch (err) {
      toast.error('Download failed', err instanceof Error ? err.message : String(err));
    } finally {
      if (spinner) setExporting(false);
    }
  };

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Data</h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card
          title="CSV files"
          subtitle={
            info ? (
              <span className="font-mono text-[12px] break-all">
                {info.dataDir}
                {!info.storage.persistent && <span className="ml-1 font-sans text-warn">· temporary</span>}
              </span>
            ) : undefined
          }
          action={
            <Button size="sm" icon={Download} loading={exporting} onClick={() => run(() => download('/data/export', 'forge-export.zip'))}>
              Export all (.zip)
            </Button>
          }
        >
          <ul className="divide-y divide-line">
            {info?.tables.map((t) => (
              <li key={t.name} className="flex items-center gap-3 py-2 text-[13px]">
                <FileSpreadsheet className="size-4 shrink-0 text-ink-3" aria-hidden />
                <span className="flex-1 truncate font-mono text-[12px]">{t.file}</span>
                <span className="text-ink-3 tabular">{fmtNum(t.rows)} rows</span>
                <IconButton size="sm" icon={Download} label={`Download ${t.file}`} onClick={() => run(() => download(`/data/export/${t.name}`, t.file), false)} />
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Backups"
          subtitle="Taken automatically before every delete, restore and import."
          action={
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setImportFile(file);
                  e.target.value = '';
                }}
              />
              <Button size="sm" icon={Upload} onClick={() => fileInput.current?.click()}>
                Import .zip
              </Button>
              <Button size="sm" variant="primary" icon={Archive} loading={backup.isPending} onClick={() => backup.mutate(undefined)}>
                Back up now
              </Button>
            </>
          }
        >
          {recent.length === 0 ? (
            <p className="text-[13px] text-ink-3">No backups yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2 text-[13px]">
                  <Database className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{b.reason}</p>
                    <p className="text-xs text-ink-3 tabular">{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                  <Badge tone={b.kind === 'manual' ? 'electric' : 'neutral'}>{b.kind}</Badge>
                  <IconButton size="sm" icon={RotateCcw} label={`Restore backup from ${new Date(b.created_at).toLocaleString()}`} onClick={() => setRestoring(b)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {!!info?.sampleRows && (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Sample data is loaded</p>
              <p className="text-[13px] text-ink-3">
                {fmtNum(info.sampleRows)} demo records (IDs starting with <code className="font-mono">sample_</code>) are mixed into your data. Remove them when you’re ready to track for real.
              </p>
            </div>
            <Button variant="danger" icon={Trash2} onClick={() => setRemoveSample(true)}>
              Remove sample data
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!restoring}
        onClose={() => setRestoring(null)}
        loading={restore.isPending}
        onConfirm={async () => {
          if (!restoring) return;
          await restore.mutateAsync(restoring.id).catch(() => undefined);
          setRestoring(null);
        }}
        title="Restore this backup?"
        body={
          restoring && (
            <>
              Your CSV files will be replaced with the backup “<strong className="text-ink">{restoring.reason}</strong>” from {new Date(restoring.created_at).toLocaleString()}. Your current data is backed up first, so
              you can undo this.
            </>
          )
        }
        confirmLabel="Restore backup"
      />
      <ConfirmDialog
        open={!!importFile}
        onClose={() => setImportFile(null)}
        loading={importZip.isPending}
        onConfirm={async () => {
          if (!importFile) return;
          await importZip.mutateAsync(importFile).catch(() => undefined);
          setImportFile(null);
        }}
        title="Import this export?"
        body={importFile && <>CSV files inside <strong className="text-ink">{importFile.name}</strong> will replace your current files. Your current data is backed up first.</>}
        confirmLabel="Import and replace"
      />
      <ConfirmDialog
        open={removeSample}
        onClose={() => setRemoveSample(false)}
        loading={sample.isPending}
        onConfirm={async () => {
          await sample.mutateAsync(undefined).catch(() => undefined);
          setRemoveSample(false);
        }}
        title="Remove sample data?"
        body={<>All {fmtNum(info?.sampleRows ?? 0)} sample records will be deleted and achievements rebuilt from your own entries. A backup is saved first.</>}
        confirmLabel="Remove sample data"
      />
    </div>
  );
}
