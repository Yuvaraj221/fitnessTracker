import { joinGroups, type Exercise, type ExerciseSet, type Workout } from '@forge/shared';
import { Router } from 'express';
import { transaction, type Row } from '../csv/store';
import { notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { sendMutation } from '../lib/respond';
import { validate, workoutInput, type WorkoutInput } from '../lib/validation';
import { createBackup } from '../services/backup';
import { joinWorkouts, loadWorkouts } from '../services/repo';

export const workoutsRouter = Router();

/** Flattens the nested editor payload into exercise and set rows. */
function buildChildren(workoutId: string, input: WorkoutInput) {
  const exercises: Exercise[] = [];
  const sets: ExerciseSet[] = [];
  for (const ex of input.exercises) {
    const exercise_id = newId('ex');
    const weights = ex.sets.map((s) => s.weight_kg).filter((w): w is number => w != null && w > 0);
    exercises.push({
      exercise_id,
      workout_id: workoutId,
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group,
      sets: ex.sets.length,
      reps: ex.sets.reduce((sum, s) => sum + s.reps, 0),
      weight_kg: weights.length ? Math.max(...weights) : null,
      rest_seconds: ex.rest_seconds,
      notes: ex.notes,
    });
    ex.sets.forEach((s, i) =>
      sets.push({ set_id: newId('set'), exercise_id, set_number: i + 1, reps: s.reps, weight_kg: s.weight_kg, notes: s.notes }),
    );
  }
  return { exercises, sets };
}

function toWorkoutRow(id: string, input: WorkoutInput, created_at: string): Workout {
  return {
    workout_id: id,
    date: input.date,
    workout_name: input.workout_name,
    muscle_group: joinGroups(input.muscle_groups),
    duration_minutes: input.duration_minutes,
    notes: input.notes,
    created_at,
  };
}

/** Replaces a workout's children (or removes the workout) inside one transaction. */
function saveWorkout(id: string, input: WorkoutInput | null, mode: 'create' | 'update' | 'delete') {
  return transaction(async (tx) => {
    const [workouts, exercises, sets] = await Promise.all([
      tx.read<Workout>('workouts'),
      tx.read<Exercise>('exercises'),
      tx.read<ExerciseSet>('exercise_sets'),
    ]);
    const existing = workouts.find((w) => w.workout_id === id);
    if (mode !== 'create' && !existing) throw notFound('Workout');
    if (mode === 'delete') await createBackup(`before deleting workout ${existing!.workout_name}`);

    const oldExerciseIds = new Set(exercises.filter((e) => e.workout_id === id).map((e) => e.exercise_id));
    let nextWorkouts = workouts.filter((w) => w.workout_id !== id);
    let nextExercises = exercises.filter((e) => e.workout_id !== id);
    let nextSets = sets.filter((s) => !oldExerciseIds.has(s.exercise_id));

    let saved: Workout | null = null;
    if (input) {
      saved = toWorkoutRow(id, input, existing?.created_at ?? new Date().toISOString());
      const children = buildChildren(id, input);
      // Keep the record's original position in the file when editing.
      const idx = workouts.findIndex((w) => w.workout_id === id);
      nextWorkouts = idx >= 0 ? workouts.map((w) => (w.workout_id === id ? saved! : w)) : [...nextWorkouts, saved];
      nextExercises = [...nextExercises, ...children.exercises];
      nextSets = [...nextSets, ...children.sets];
    }

    tx.write('workouts', nextWorkouts as unknown as Row[]);
    tx.write('exercises', nextExercises as unknown as Row[]);
    tx.write('exercise_sets', nextSets as unknown as Row[]);
    return saved ? joinWorkouts([saved], nextExercises, nextSets)[0] : { workout_id: id };
  });
}

workoutsRouter.get('/', async (_req, res) => {
  res.json({ data: await loadWorkouts() });
});

workoutsRouter.get('/:id', async (req, res) => {
  const w = (await loadWorkouts()).find((x) => x.workout_id === req.params.id);
  if (!w) throw notFound('Workout');
  res.json({ data: w });
});

workoutsRouter.post('/', async (req, res) => {
  const input = validate(workoutInput, req.body);
  await sendMutation(res, await saveWorkout(newId('wo'), input, 'create'), 201);
});

workoutsRouter.put('/:id', async (req, res) => {
  const input = validate(workoutInput, req.body);
  await sendMutation(res, await saveWorkout(req.params.id, input, 'update'));
});

workoutsRouter.delete('/:id', async (req, res) => {
  await sendMutation(res, await saveWorkout(req.params.id, null, 'delete'));
});
