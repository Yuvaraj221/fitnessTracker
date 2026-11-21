import {
  addDays,
  isSampleId,
  MUSCLE_GROUPS,
  personalRecords,
  splitGroups,
  workoutDates,
  workoutTotals,
  type WorkoutWithExercises,
} from '@forge/shared';
import { ChevronDown, Dumbbell, Layers, Pencil, Plus, Search, Trash2, Trophy, Weight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { keys, useDataset, useForgeMutation, useToday } from '../api/hooks';
import { Input, Select } from '../components/ui/form';
import { ConfirmDialog } from '../components/ui/overlay';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, PageHeader, PageSkeleton, SampleBadge, StatTile } from '../components/ui/primitives';
import { WorkoutEditor } from '../features/workouts/WorkoutEditor';
import { cn } from '../lib/cn';
import { fmtCompact, fmtDateMedium, fmtDuration, fmtNum, fmtWeekday } from '../lib/format';
import { useUnits } from '../lib/units';

export function WorkoutsPage() {
  const { data: ds, isLoading, error, refetch } = useDataset();
  const today = useToday();
  const units = useUnits();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<WorkoutWithExercises | null>(null);
  const [editorOpen, setEditorOpen] = useState(params.get('new') === '1');
  const [deleting, setDeleting] = useState<WorkoutWithExercises | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const remove = useForgeMutation((id: string) => api.send('DELETE', `/workouts/${id}`), {
    invalidate: [keys.workouts],
    success: 'Workout deleted. A backup was saved first.',
  });

  const view = useMemo(() => {
    if (!ds) return null;
    const prs = personalRecords(ds.workouts);
    const prsByExercise = new Set(prs.map((p) => p.exercise_id));
    const from = addDays(today, -29);
    const recent = ds.workouts.filter((w) => w.date >= from && w.date <= today);
    const rt = recent.map(workoutTotals);
    const q = query.trim().toLowerCase();
    const filtered = ds.workouts.filter((w) => {
      if (group && !splitGroups(w.muscle_group).includes(group) && !w.exercises.some((e) => e.muscle_group === group)) return false;
      if (q && !w.workout_name.toLowerCase().includes(q) && !w.exercises.some((e) => e.exercise_name.toLowerCase().includes(q))) return false;
      return true;
    });
    return {
      prsByExercise,
      filtered,
      stats: {
        workouts: workoutDates(recent).length,
        sets: rt.reduce((s, t) => s + t.sets, 0),
        volume: rt.reduce((s, t) => s + t.volume, 0),
        prs: prs.filter((p) => p.date >= from).length,
      },
    };
  }, [ds, today, query, group]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !ds || !view) return <PageSkeleton />;

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    if (params.get('new')) setParams({}, { replace: true });
  };
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <PageHeader
        title="Workouts"
        description="Every session, exercise and set — saved to workouts.csv, exercises.csv and exercise_sets.csv."
        actions={
          <Button variant="primary" icon={Plus} onClick={openNew}>
            Log workout
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Workouts · 30 days" icon={Dumbbell} value={view.stats.workouts} />
        <StatTile label="Sets · 30 days" icon={Layers} value={fmtNum(view.stats.sets)} />
        <StatTile label="Volume · 30 days" icon={Weight} value={fmtCompact(units.w(view.stats.volume))} unit={units.weight} />
        <StatTile label="Personal records · 30 days" icon={Trophy} value={view.stats.prs} />
      </div>

      <div className="mt-6 mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search workouts and exercises" placeholder="Search workouts or exercises" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filter by muscle group" value={group} onChange={(e) => setGroup(e.target.value)} className="sm:w-48">
          <option value="">All muscle groups</option>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
      </div>

      {ds.workouts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Dumbbell}
            title="No workouts yet"
            description="Log your first session to start tracking sets, volume and personal records."
            action={
              <Button variant="primary" icon={Plus} onClick={openNew}>
                Log your first workout
              </Button>
            }
          />
        </Card>
      ) : view.filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="No workouts match these filters"
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQuery('');
                  setGroup('');
                }}
              >
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {view.filtered.map((w) => {
            const t = workoutTotals(w);
            const prCount = w.exercises.filter((e) => view.prsByExercise.has(e.exercise_id)).length;
            const open = expanded.has(w.workout_id);
            return (
              <li key={w.workout_id} className="rounded-[var(--radius-card)] border border-line bg-surface">
                <div className="flex items-center gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => toggle(w.workout_id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <div className="hidden w-14 shrink-0 text-center sm:block">
                      <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{fmtWeekday(w.date)}</p>
                      <p className="text-lg leading-tight font-semibold tabular">{Number(w.date.slice(8))}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{w.workout_name}</p>
                        {prCount > 0 && (
                          <Badge tone="brand" icon={Trophy}>
                            {prCount} PR{prCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {isSampleId(w.workout_id) && <SampleBadge />}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-3 tabular">
                        <span className="sm:hidden">{fmtDateMedium(w.date)} · </span>
                        {splitGroups(w.muscle_group).join(', ') || 'No muscle groups'} · {t.exercises} exercises · {t.sets} sets · {fmtNum(t.reps)} reps ·{' '}
                        {fmtCompact(units.w(t.volume))} {units.weight}
                        {w.duration_minutes != null && ` · ${fmtDuration(w.duration_minutes)}`}
                      </p>
                    </div>
                    <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform duration-150', open && 'rotate-180')} aria-hidden />
                  </button>
                  <div className="flex shrink-0">
                    <IconButton
                      icon={Pencil}
                      label={`Edit ${w.workout_name}`}
                      onClick={() => {
                        setEditing(w);
                        setEditorOpen(true);
                      }}
                    />
                    <IconButton icon={Trash2} tone="danger" label={`Delete ${w.workout_name}`} onClick={() => setDeleting(w)} />
                  </div>
                </div>
                {open && (
                  <div className="border-t border-line px-4 py-3">
                    {w.exercises.length === 0 ? (
                      <p className="text-[13px] text-ink-3">No exercises recorded.</p>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {w.exercises.map((e) => (
                          <div key={e.exercise_id} className="rounded-lg border border-line bg-bg p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[13px] font-medium">{e.exercise_name}</p>
                              {view.prsByExercise.has(e.exercise_id) && (
                                <Badge tone="brand" icon={Trophy}>
                                  PR
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-ink-3">
                              {e.muscle_group || 'Unassigned'}
                              {e.rest_seconds != null && ` · ${e.rest_seconds}s rest`}
                            </p>
                            <ol className="mt-2 space-y-0.5 text-xs text-ink-2 tabular">
                              {e.set_list.map((s) => (
                                <li key={s.set_id} className="flex justify-between">
                                  <span className="text-ink-3">Set {s.set_number}</span>
                                  <span>
                                    {s.reps} reps {s.weight_kg ? `× ${fmtNum(units.w(s.weight_kg), 1)} ${units.weight}` : '· bodyweight'}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    )}
                    {w.notes && <p className="mt-3 text-[13px] whitespace-pre-wrap text-ink-2">{w.notes}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <WorkoutEditor open={editorOpen} onClose={closeEditor} workout={editing} workouts={ds.workouts} defaultDate={today} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.workout_id).catch(() => undefined);
          setDeleting(null);
        }}
        title="Delete workout?"
        body={
          deleting && (
            <>
              <strong className="text-ink">{deleting.workout_name}</strong> on {fmtDateMedium(deleting.date)} and its {deleting.exercises.length} exercises will be removed
              from your CSV files. A backup is saved automatically first.
            </>
          )
        }
        confirmLabel="Delete workout"
      />
    </div>
  );
}
