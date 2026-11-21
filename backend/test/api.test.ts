// End-to-end API tests against a throwaway data directory.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';

const dir = await mkdtemp(path.join(tmpdir(), 'forge-test-'));
process.env.FORGE_DATA_DIR = path.join(dir, 'data');
process.env.FORGE_BACKUP_DIR = path.join(dir, 'backups');

const { initDataFiles } = await import('../src/csv/init');
const { parseCsv, serializeCsv } = await import('../src/csv/store');
const { createApp } = await import('../src/app');

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

before(async () => {
  await initDataFiles(() => undefined);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
};

test('CSV round-trips commas, quotes, newlines and unicode', () => {
  const rows = [{ meal_id: 'm1', food_name: 'Eggs, "free-range"\nwith toast', notes: 'café ✓', calories: 300 }];
  const text = serializeCsv(['meal_id', 'food_name', 'notes', 'calories'], rows);
  const back = parseCsv('meals', text).rows[0];
  assert.equal(back.food_name, rows[0].food_name);
  assert.equal(back.notes, 'café ✓');
  assert.equal(back.calories, 300);
});

test('workout CRUD persists to CSV with set-level rows', async () => {
  const payload = {
    date: '2026-11-20',
    workout_name: 'Back, Biceps & "Grip"',
    muscle_groups: ['Back', 'Biceps'],
    duration_minutes: 60,
    notes: 'line one\nline two',
    exercises: [
      { exercise_name: 'Lat Pulldown', muscle_group: 'Back', rest_seconds: 90, sets: [{ reps: 12, weight_kg: 30 }, { reps: 10, weight_kg: 35 }, { reps: 8, weight_kg: 40 }] },
      { exercise_name: 'Pull-up', muscle_group: 'Back', sets: [{ reps: 8 }, { reps: 6, weight_kg: null }] },
    ],
  };
  const created = await call('POST', '/workouts', payload);
  assert.equal(created.status, 201);
  const id = created.json.data.workout_id;
  assert.equal(created.json.data.exercises[0].set_list.length, 3);
  assert.ok(created.json.unlocked.some((a: any) => a.achievement_id === 'first_workout'));

  const csv = await readFile(path.join(process.env.FORGE_DATA_DIR!, 'workouts.csv'), 'utf8');
  assert.match(csv, /"Back, Biceps & ""Grip"""/);
  const sets = await readFile(path.join(process.env.FORGE_DATA_DIR!, 'exercise_sets.csv'), 'utf8');
  assert.equal(sets.trim().split('\n').length, 1 + 5);
  const ex = parseCsv('exercises', await readFile(path.join(process.env.FORGE_DATA_DIR!, 'exercises.csv'), 'utf8')).rows;
  assert.equal(ex[0].weight_kg, 40);
  assert.equal(ex[1].weight_kg, null);

  const updated = await call('PUT', `/workouts/${id}`, { ...payload, exercises: [payload.exercises[0]] });
  assert.equal(updated.status, 200);
  const list = await call('GET', '/workouts');
  assert.equal(list.json.data.length, 1);
  assert.equal(list.json.data[0].exercises.length, 1);
  assert.equal(list.json.data[0].notes, 'line one\nline two');

  // Achievements are not re-awarded.
  assert.ok(!updated.json.unlocked.some((a: any) => a.achievement_id === 'first_workout'));

  const del = await call('DELETE', `/workouts/${id}`);
  assert.equal(del.status, 200);
  assert.equal((await call('GET', '/workouts')).json.data.length, 0);
  const setsAfter = await readFile(path.join(process.env.FORGE_DATA_DIR!, 'exercise_sets.csv'), 'utf8');
  assert.equal(setsAfter.trim().split('\n').length, 1);
  // A backup was taken before deleting.
  const backups = await readdir(process.env.FORGE_BACKUP_DIR!);
  assert.ok(backups.some((b) => b.includes('before-deleting-workout')));
});

test('validation errors are reported clearly', async () => {
  const bad = await call('POST', '/meals', { date: '2026-02-30', meal_type: 'lunch', food_name: 'Rice', calories: 100 });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error.message, /date/);
  const neg = await call('POST', '/body-metrics', { date: '2026-11-20' });
  assert.equal(neg.status, 400);
});

test('meal + body metric CRUD and concurrent writes', async () => {
  const writes = Array.from({ length: 25 }, (_, i) =>
    call('POST', '/meals', { date: '2026-11-20', meal_type: 'dinner', food_name: `Food ${i}`, calories: 100, protein: 10 }),
  );
  const results = await Promise.all(writes);
  assert.ok(results.every((r) => r.status === 201));
  const meals = await call('GET', '/meals?from=2026-11-20&to=2026-11-20');
  assert.equal(meals.json.data.length, 25);

  const id = meals.json.data[0].meal_id;
  const upd = await call('PUT', `/meals/${id}`, { ...meals.json.data[0], food_name: 'Updated', calories: 250 });
  assert.equal(upd.json.data.calories, 250);
  assert.equal((await call('DELETE', `/meals/${id}`)).status, 200);
  assert.equal((await call('DELETE', `/meals/${id}`)).status, 404);

  const bm = await call('POST', '/body-metrics', { date: '2026-11-20', weight_kg: 80.5 });
  assert.equal(bm.status, 201);
  assert.equal(bm.json.data.waist_cm, null);
});

test('settings update and backups restore', async () => {
  const s = await call('PUT', '/settings', { calorie_target: 2600, weight_unit: 'lbs' });
  assert.equal(s.json.data.calorie_target, 2600);
  assert.equal(s.json.data.weight_unit, 'lbs');

  const backup = await call('POST', '/data/backups', { reason: 'test' });
  assert.equal(backup.status, 201);
  await call('PUT', '/settings', { calorie_target: 1800 });
  const restored = await call('POST', `/data/backups/${backup.json.data.id}/restore`);
  assert.equal(restored.status, 200);
  assert.equal((await call('GET', '/settings')).json.data.calorie_target, 2600);
});
