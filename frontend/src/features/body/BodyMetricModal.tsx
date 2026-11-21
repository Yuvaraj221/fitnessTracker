import { MEASUREMENT_KEYS, MEASUREMENT_LABELS, type BodyMetric } from '@forge/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { keys, useForgeMutation } from '../../api/hooks';
import { Field, Input, NumberInput, numStr, parseNum, Textarea } from '../../components/ui/form';
import { Modal } from '../../components/ui/overlay';
import { Button } from '../../components/ui/primitives';
import { useUnits } from '../../lib/units';

type Key = 'weight_kg' | 'body_fat_percentage' | (typeof MEASUREMENT_KEYS)[number];
const KEYS: Key[] = ['weight_kg', 'body_fat_percentage', ...MEASUREMENT_KEYS];

export function BodyMetricModal({ open, onClose, entry, defaultDate }: { open: boolean; onClose: () => void; entry: BodyMetric | null; defaultDate: string }) {
  const u = useUnits();
  const toDisplay = (k: Key, v: number | null) => (k === 'weight_kg' ? u.w(v) : k === 'body_fat_percentage' ? v : u.l(v));
  const toStore = (k: Key, v: number | null) => (k === 'weight_kg' ? u.toKg(v) : k === 'body_fat_percentage' ? v : u.toCm(v));

  const init = () => ({
    date: entry?.date ?? defaultDate,
    notes: entry?.notes ?? '',
    values: Object.fromEntries(KEYS.map((k) => [k, numStr(toDisplay(k, entry?.[k] ?? null), 2)])) as Record<Key, string>,
  });
  const [draft, setDraft] = useState(init);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(init());
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const errors: Partial<Record<Key | 'form', string>> = {};
  for (const k of KEYS) {
    const n = parseNum(draft.values[k]);
    if (n != null && (Number.isNaN(n) || n <= 0)) errors[k] = 'Use a positive number';
  }
  const bf = parseNum(draft.values.body_fat_percentage);
  if (bf != null && !Number.isNaN(bf) && (bf < 1 || bf > 75)) errors.body_fat_percentage = 'Between 1 and 75%';
  if (KEYS.every((k) => parseNum(draft.values[k]) == null)) errors.form = 'Enter at least one measurement';

  const save = useForgeMutation(
    (body: Omit<BodyMetric, 'metric_id'>) => (entry ? api.send('PUT', `/body-metrics/${entry.metric_id}`, body) : api.send('POST', '/body-metrics', body)),
    { invalidate: [keys.body], success: entry ? 'Measurement updated' : 'Measurement saved' },
  );

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const body = { date: draft.date, notes: draft.notes.trim() } as Omit<BodyMetric, 'metric_id'>;
    for (const k of KEYS) (body as unknown as Record<string, number | null>)[k] = toStore(k, parseNum(draft.values[k]));
    await save.mutateAsync(body);
    onClose();
  };

  const setVal = (k: Key, v: string) => setDraft((d) => ({ ...d, values: { ...d.values, [k]: v } }));
  const show = (k: Key | 'form') => (submitted ? errors[k] : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit measurement' : 'Log measurement'}
      description="Every field is optional — record whatever you measured today."
      footer={
        <>
          {show('form') && <p className="mr-auto self-center text-xs text-bad">{show('form')}</p>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => submit()} loading={save.isPending}>
            {entry ? 'Save changes' : 'Save measurement'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">{(id) => <Input id={id} type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />}</Field>
          <Field label="Body weight" error={show('weight_kg')}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} data-autofocus suffix={u.weight} invalid={!!show('weight_kg')} value={draft.values.weight_kg} onChange={(e) => setVal('weight_kg', e.target.value)} />}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Body fat" optional error={show('body_fat_percentage')}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} suffix="%" invalid={!!show('body_fat_percentage')} value={draft.values.body_fat_percentage} onChange={(e) => setVal('body_fat_percentage', e.target.value)} />}
          </Field>
          {MEASUREMENT_KEYS.map((k) => (
            <Field key={k} label={MEASUREMENT_LABELS[k]} optional error={show(k)}>
              {(id, d) => <NumberInput id={id} aria-describedby={d} suffix={u.length} invalid={!!show(k)} value={draft.values[k]} onChange={(e) => setVal(k, e.target.value)} />}
            </Field>
          ))}
        </div>
        <Field label="Notes" optional>
          {(id) => <Textarea id={id} className="min-h-16" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
