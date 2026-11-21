import {
  bestForExercise,
  exerciseKey,
  MUSCLE_GROUPS,
  previousSession,
  splitGroups,
  type WorkoutWithExercises,
} from '@forge/shared';
import { ChevronDown, ChevronUp, Copy, History, Plus, Trash2, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { keys, useForgeMutation } from '../../api/hooks';
import { ChipSelect, Field, Input, NumberInput, parseNum, numStr, Select, Textarea } from '../../components/ui/form';
import { ConfirmDialog, SlideOver } from '../../components/ui/overlay';
import { Badge, Button, IconButton } from '../../components/ui/primitives';
import { fmtCompact, fmtDate, fmtNum } from '../../lib/format';
import { useUnits, type Units } from '../../lib/units';

interface SetDraft {
  key: string;
  reps: string;
  weight: string;
}
interface ExerciseDraft {
  key: string;
  name: string;
  muscle_group: string;
  rest: string;
  notes: string;
  sets: SetDraft[];
}
interface WorkoutDraft {
  date: string;
  name: string;
  groups: string[];
  duration: string;
  notes: string;
  exercises: ExerciseDraft[];
}

let seq = 0;
const k = () => `k${++seq}`;
const blankSet = (from?: SetDraft): SetDraft => ({ key: k(), reps: from?.reps ?? '', weight: from?.weight ?? '' });
const blankExercise = (): ExerciseDraft => ({ key: k(), name: '', muscle_group: '', rest: '', notes: '', sets: [blankSet()] });

function toDraft(w: WorkoutWithExercises | null, date: string, u: Units): WorkoutDraft {
  if (!w) return { date, name: '', groups: [], duration: '', notes: '', exercises: [blankExercise()] };
  return {
    date: w.date,
    name: w.workout_name,
    groups: splitGroups(w.muscle_group),
    duration: numStr(w.duration_minutes),
    notes: w.notes,
    exercises: w.exercises.map((e) => ({
      key: k(),
      name: e.exercise_name,
      muscle_group: e.muscle_group,
      rest: numStr(e.rest_seconds),
      notes: e.notes,
      sets: e.set_list.map((s) => ({ key: k(), reps: String(s.reps), weight: numStr(u.w(s.weight_kg), 2) })),
    })),
  };
}

type Errors = Record<string, string>;

function validateDraft(d: WorkoutDraft): Errors {
  const e: Errors = {};
  if (!d.date) e.date = 'Pick the workout date';
  if (!d.name.trim()) e.name = 'Give the workout a name, e.g. “Push Day”';
  const dur = parseNum(d.duration);
  if (dur != null && (Number.isNaN(dur) || dur < 0 || dur > 1440)) e.duration = 'Enter minutes between 0 and 1440';
  d.exercises.forEach((ex, i) => {
    if (!ex.name.trim()) e[`ex.${i}.name`] = 'Name this exercise';
    const rest = parseNum(ex.rest);
    if (rest != null && (Number.isNaN(rest) || rest < 0)) e[`ex.${i}.rest`] = 'Rest must be seconds ≥ 0';
    if (!ex.sets.length) e[`ex.${i}.name`] = 'Add at least one set';
    ex.sets.forEach((s, j) => {
      const reps = parseNum(s.reps);
      if (reps == null || Number.isNaN(reps) || reps < 0 || !Number.isInteger(reps)) e[`ex.${i}.set.${j}.reps`] = 'Whole number';
      const w = parseNum(s.weight);
      if (w != null && (Number.isNaN(w) || w < 0)) e[`ex.${i}.set.${j}.weight`] = 'Number ≥ 0';
    });
  });
  return e;
}

function toPayload(d: WorkoutDraft, u: Units) {
  return {
    date: d.date,
    workout_name: d.name.trim(),
    muscle_groups: d.groups,
    duration_minutes: parseNum(d.duration),
    notes: d.notes.trim(),
    exercises: d.exercises.map((ex) => ({
      exercise_name: ex.name.trim(),
      muscle_group: ex.muscle_group,
      rest_seconds: parseNum(ex.rest),
      notes: ex.notes.trim(),
      sets: ex.sets.map((s) => ({ reps: parseNum(s.reps) ?? 0, weight_kg: u.toKg(parseNum(s.weight)), notes: '' })),
    })),
  };
}

export function WorkoutEditor({
  open,
  onClose,
  workout,
  workouts,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  workout: WorkoutWithExercises | null;
  workouts: WorkoutWithExercises[];
  defaultDate: string;
}) {
  const units = useUnits();
  const [draft, setDraft] = useState<WorkoutDraft>(() => toDraft(workout, defaultDate, units));
  const [initial, setInitial] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = toDraft(workout, defaultDate, units);
    setDraft(d);
    setInitial(JSON.stringify({ ...d, exercises: d.exercises.map((e) => ({ ...e, key: '', sets: e.sets.map((s) => ({ ...s, key: '' })) })) }));
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workout?.workout_id]);

  const errors = useMemo(() => (submitted ? validateDraft(draft) : {}), [draft, submitted]);
  const dirty =
    JSON.stringify({ ...draft, exercises: draft.exercises.map((e) => ({ ...e, key: '', sets: e.sets.map((s) => ({ ...s, key: '' })) })) }) !== initial;

  const knownExercises = useMemo(() => {
    const names = new Map<string, { name: string; group: string }>();
    for (const w of workouts) for (const e of w.exercises) if (!names.has(exerciseKey(e.exercise_name))) names.set(exerciseKey(e.exercise_name), { name: e.exercise_name, group: e.muscle_group });
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [workouts]);

  const save = useForgeMutation(
    (payload: ReturnType<typeof toPayload>) =>
      workout ? api.send<WorkoutWithExercises>('PUT', `/workouts/${workout.workout_id}`, payload) : api.send<WorkoutWithExercises>('POST', '/workouts', payload),
    { invalidate: [keys.workouts], success: workout ? 'Workout updated' : 'Workout saved' },
  );

  const update = (patch: Partial<WorkoutDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateEx = (i: number, patch: Partial<ExerciseDraft>) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const updateSet = (i: number, j: number, patch: Partial<SetDraft>) =>
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((e, x) => (x === i ? { ...e, sets: e.sets.map((s, y) => (y === j ? { ...s, ...patch } : s)) } : e)),
    }));
  const moveEx = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.exercises];
      const [item] = list.splice(i, 1);
      list.splice(i + dir, 0, item);
      return { ...d, exercises: list };
    });

  const totals = useMemo(() => {
    let sets = 0;
    let reps = 0;
    let volume = 0;
    for (const ex of draft.exercises)
      for (const s of ex.sets) {
        const r = parseNum(s.reps);
        const w = parseNum(s.weight);
        sets += 1;
        if (r && !Number.isNaN(r)) {
          reps += r;
          if (w && !Number.isNaN(w)) volume += r * w;
        }
      }
    return { sets, reps, volume };
  }, [draft]);

  const requestClose = () => (dirty && !save.isPending ? setConfirmDiscard(true) : onClose());

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const errs = validateDraft(draft);
    if (Object.keys(errs).length) return;
    await save.mutateAsync(toPayload(draft, units));
    onClose();
  };

  const errorCount = Object.keys(errors).length;

  return (
    <>
      <SlideOver
        open={open}
        onClose={requestClose}
        title={workout ? 'Edit workout' : 'Log workout'}
        description="Track every set. Weight is optional for bodyweight movements."
        footer={
          <>
            <p className="mr-auto text-xs text-ink-3 tabular">
              {errorCount ? (
                <span className="text-bad">Fix {errorCount} highlighted field{errorCount === 1 ? '' : 's'} to save</span>
              ) : (
                <>
                  {totals.sets} sets · {fmtNum(totals.reps)} reps · {fmtCompact(totals.volume)} {units.weight} volume
                </>
              )}
            </p>
            <Button onClick={requestClose}>Cancel</Button>
            <Button variant="primary" onClick={() => submit()} loading={save.isPending}>
              {workout ? 'Save changes' : 'Save workout'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-6" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px_120px]">
            <Field label="Workout name" error={errors.name}>
              {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Back & Biceps" data-autofocus />}
            </Field>
            <Field label="Date" error={errors.date}>
              {(id, d) => <Input id={id} aria-describedby={d} type="date" value={draft.date} max="2100-12-31" onChange={(e) => update({ date: e.target.value })} />}
            </Field>
            <Field label="Duration" optional error={errors.duration}>
              {(id, d) => <NumberInput id={id} aria-describedby={d} invalid={!!errors.duration} suffix="min" value={draft.duration} onChange={(e) => update({ duration: e.target.value })} />}
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Muscle groups</p>
            <ChipSelect label="Muscle groups" options={MUSCLE_GROUPS} value={draft.groups} onChange={(groups) => update({ groups })} />
          </div>

          <datalist id="known-exercises">
            {knownExercises.map((e) => (
              <option key={e.name} value={e.name} />
            ))}
          </datalist>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Exercises</h3>
              <span className="text-xs text-ink-3">{draft.exercises.length} added</span>
            </div>
            {draft.exercises.map((ex, i) => (
              <ExerciseBlock
                key={ex.key}
                index={i}
                ex={ex}
                count={draft.exercises.length}
                errors={errors}
                workouts={workouts}
                date={draft.date}
                excludeWorkoutId={workout?.workout_id}
                units={units}
                knownGroup={knownExercises.find((n) => exerciseKey(n.name) === exerciseKey(ex.name))?.group}
                onChange={(patch) => updateEx(i, patch)}
                onSet={(j, patch) => updateSet(i, j, patch)}
                onRemove={() => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }))}
                onMove={(dir) => moveEx(i, dir)}
              />
            ))}
            <Button icon={Plus} onClick={() => update({ exercises: [...draft.exercises, blankExercise()] })} className="w-full border-dashed">
              Add exercise
            </Button>
          </div>

          <Field label="Notes" optional>
            {(id) => <Textarea id={id} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="How did it feel? Anything to adjust next time?" />}
          </Field>
          <button type="submit" hidden />
        </form>
      </SlideOver>
      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        body={<>Your edits to {draft.name ? <strong className="text-ink">{draft.name}</strong> : 'this workout'} haven’t been saved to workouts.csv yet.</>}
        confirmLabel="Discard changes"
      />
    </>
  );
}

function ExerciseBlock({
  index,
  ex,
  count,
  errors,
  workouts,
  date,
  excludeWorkoutId,
  units,
  knownGroup,
  onChange,
  onSet,
  onRemove,
  onMove,
}: {
  index: number;
  ex: ExerciseDraft;
  count: number;
  errors: Errors;
  workouts: WorkoutWithExercises[];
  date: string;
  excludeWorkoutId?: string;
  units: Units;
  knownGroup?: string;
  onChange: (patch: Partial<ExerciseDraft>) => void;
  onSet: (j: number, patch: Partial<SetDraft>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const prev = ex.name.trim() ? previousSession(workouts, ex.name, { beforeDate: date, excludeWorkoutId }) : null;
  const best = ex.name.trim() ? bestForExercise(workouts, ex.name, excludeWorkoutId) : null;
  const weights = ex.sets.map((s) => units.toKg(parseNum(s.weight))).filter((w): w is number => w != null && !Number.isNaN(w) && w > 0);
  const top = weights.length ? Math.max(...weights) : null;
  const maxReps = Math.max(0, ...ex.sets.map((s) => parseNum(s.reps) ?? 0).filter((n) => !Number.isNaN(n)));
  const isPR = best && ((top != null && best.topWeight != null && top > best.topWeight) || (top == null && best.topWeight == null && maxReps > best.maxReps));

  const copyLast = () => {
    if (!prev) return;
    onChange({ sets: prev.sets.map((s) => ({ key: k(), reps: String(s.reps), weight: numStr(units.w(s.weight_kg), 2) })) });
  };

  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="flex items-start gap-2">
        <span className="mt-2.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-raised text-[11px] font-semibold text-ink-2 tabular">{index + 1}</span>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_140px_110px]">
          <Field label="Exercise" error={errors[`ex.${index}.name`]}>
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                invalid={!!errors[`ex.${index}.name`]}
                list="known-exercises"
                value={ex.name}
                placeholder="e.g. Lat Pulldown"
                onChange={(e) => onChange({ name: e.target.value })}
                onBlur={() => !ex.muscle_group && knownGroup && onChange({ muscle_group: knownGroup })}
              />
            )}
          </Field>
          <Field label="Muscle group" optional>
            {(id) => (
              <Select id={id} value={ex.muscle_group} onChange={(e) => onChange({ muscle_group: e.target.value })}>
                <option value="">—</option>
                {MUSCLE_GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Rest" optional error={errors[`ex.${index}.rest`]}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} suffix="sec" value={ex.rest} onChange={(e) => onChange({ rest: e.target.value })} />}
          </Field>
        </div>
        <div className="mt-6 flex shrink-0 flex-col sm:flex-row">
          <IconButton size="sm" icon={ChevronUp} label="Move exercise up" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton size="sm" icon={ChevronDown} label="Move exercise down" disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton size="sm" icon={Trash2} tone="danger" label={`Remove ${ex.name || 'exercise'}`} onClick={onRemove} />
        </div>
      </div>

      {(prev || isPR) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-7 text-xs text-ink-3">
          {prev && (
            <>
              <History className="size-3.5" aria-hidden />
              <span className="tabular">
                Last time ({fmtDate(prev.date)}):{' '}
                {prev.sets.map((s) => (s.weight_kg ? `${s.reps}×${fmtNum(units.w(s.weight_kg), 1)}` : `${s.reps} reps`)).join(' · ')}
                {prev.topWeight != null && ` ${units.weight}`}
              </span>
              <button type="button" onClick={copyLast} className="inline-flex items-center gap-1 font-medium text-electric hover:underline">
                <Copy className="size-3" aria-hidden /> Copy sets
              </button>
            </>
          )}
          {isPR && (
            <Badge tone="brand" icon={Trophy}>
              New PR
            </Badge>
          )}
        </div>
      )}

      <div className="mt-3 pl-7">
        <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 pb-1.5 text-[11px] font-medium tracking-wide text-ink-3 uppercase">
          <span>Set</span>
          <span>Reps</span>
          <span>Weight ({units.weight})</span>
          <span className="sr-only">Remove</span>
        </div>
        <div className="space-y-1.5">
          {ex.sets.map((s, j) => (
            <div key={s.key} className="grid grid-cols-[40px_1fr_1fr_32px] items-center gap-2">
              <span className="text-[13px] text-ink-3 tabular">{j + 1}</span>
              <NumberInput
                aria-label={`Set ${j + 1} reps`}
                inputMode="numeric"
                className="h-9"
                invalid={!!errors[`ex.${index}.set.${j}.reps`]}
                value={s.reps}
                placeholder="0"
                onChange={(e) => onSet(j, { reps: e.target.value })}
              />
              <NumberInput
                aria-label={`Set ${j + 1} weight in ${units.weight}`}
                className="h-9"
                invalid={!!errors[`ex.${index}.set.${j}.weight`]}
                value={s.weight}
                placeholder="Bodyweight"
                onChange={(e) => onSet(j, { weight: e.target.value })}
              />
              <IconButton
                size="sm"
                icon={Trash2}
                tone="danger"
                label={`Remove set ${j + 1}`}
                disabled={ex.sets.length === 1}
                onClick={() => onChange({ sets: ex.sets.filter((_, y) => y !== j) })}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange({ sets: [...ex.sets, blankSet(ex.sets[ex.sets.length - 1])] })}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 hover:bg-raised hover:text-ink"
        >
          <Plus className="size-3.5" aria-hidden /> Add set
        </button>
      </div>
    </div>
  );
}
