// Runs the API against the Vercel Blob driver using an in-memory fake of the
// @vercel/blob client (same semantics: ETags, allowOverwrite, ifMatch, 304s).
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

process.env.VERCEL = '1';
process.env.FORGE_ACCESS_KEY = 'test-key-123';
process.env.FORGE_SEED_SAMPLE_DATA = 'true';

const { BlobDriver } = await import('../src/storage/blob');
const { setStorage } = await import('../src/storage');
const { createApp } = await import('../src/app');

const blobs = new Map<string, { text: string; etag: string }>();
let n = 0;
const calls = { put: 0, get: 0 };
const fake = {
  async get(pathname: string, opts: { ifNoneMatch?: string }) {
    calls.get++;
    const b = blobs.get(pathname);
    if (!b) return null;
    const meta = { url: `https://blob.test/${pathname}`, downloadUrl: '', pathname, contentDisposition: '', cacheControl: '', uploadedAt: new Date(), etag: b.etag };
    if (opts.ifNoneMatch === b.etag) return { statusCode: 304, stream: null, headers: new Headers(), blob: { ...meta, contentType: null, size: null } };
    return { statusCode: 200, stream: new Response(b.text).body, headers: new Headers(), blob: { ...meta, contentType: 'text/csv', size: b.text.length } };
  },
  async put(pathname: string, body: string, opts: { allowOverwrite?: boolean; ifMatch?: string; access: string }) {
    calls.put++;
    assert.equal(opts.access, 'private');
    const cur = blobs.get(pathname);
    if (opts.ifMatch && cur?.etag !== opts.ifMatch) throw Object.assign(new Error('Precondition failed: ETag mismatch.'), { name: 'BlobPreconditionFailedError' });
    if (cur && !opts.allowOverwrite && !opts.ifMatch) throw new Error('Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
    const etag = `"e${++n}"`;
    blobs.set(pathname, { text: body, etag });
    return { pathname, url: '', downloadUrl: '', contentType: '', contentDisposition: '', etag };
  },
  async list(opts: { prefix?: string }) {
    return { blobs: [...blobs.keys()].filter((k) => k.startsWith(opts.prefix ?? '')).map((pathname) => ({ pathname, url: '', downloadUrl: '', size: 0, uploadedAt: new Date(), etag: '' })), hasMore: false };
  },
  async del(paths: string[]) {
    for (const p of paths) blobs.delete(p);
  },
};

const driver = new BlobDriver('forge/', 'private', fake as never);
setStorage(driver);

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
before(() => {
  server = createApp({ lazyInit: true }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => server.close());

const call = async (method: string, url: string, body?: unknown, key: string | null = 'test-key-123') => {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};

test('health is public and reports blob storage + access key', async () => {
  const h = await call('GET', '/health', undefined, null);
  assert.equal(h.status, 200);
  assert.deepEqual(h.json.data.storage, { kind: 'vercel-blob', persistent: true });
  assert.equal(h.json.data.accessKeyRequired, true);
});

test('API rejects requests without the access key', async () => {
  assert.equal((await call('GET', '/settings', undefined, null)).status, 401);
  assert.equal((await call('GET', '/settings', undefined, 'wrong')).status, 401);
});

test('first request initialises an empty store with CSVs and sample data', async () => {
  const w = await call('GET', '/workouts');
  assert.equal(w.status, 200);
  assert.equal(w.json.data.length, 12);
  assert.ok(blobs.has('forge/data/workouts.csv'));
  assert.match(blobs.get('forge/data/user_settings.csv')!.text, /^setting_key,setting_value\n/);
  const a = await call('GET', '/achievements');
  assert.ok(a.json.data.unlocked.length > 0);
});

test('writes persist as CSV blobs; deletes create backups in blob storage', async () => {
  const created = await call('POST', '/meals', { date: '2026-11-21', meal_type: 'dinner', food_name: 'Rice, "jasmine"', calories: 200 });
  assert.equal(created.status, 201);
  assert.match(blobs.get('forge/data/meals.csv')!.text, /"Rice, ""jasmine"""/);
  const del = await call('DELETE', `/meals/${created.json.data.meal_id}`);
  assert.equal(del.status, 200);
  const backups = await call('GET', '/data/backups');
  assert.ok(backups.json.data.some((b: any) => b.reason.includes('Rice')));
  const backupId = backups.json.data[0].id;
  assert.ok(blobs.has(`forge/backups/${backupId}/meals.csv`));
  const restored = await call('POST', `/data/backups/${backupId}/restore`);
  assert.equal(restored.status, 200);
  const meals = await call('GET', '/meals?from=2026-11-21&to=2026-11-21');
  assert.ok(meals.json.data.some((m: any) => m.food_name === 'Rice, "jasmine"'));
});

test('unchanged files are served from cache via ETag (304)', async () => {
  const before = calls.get;
  await call('GET', '/settings');
  await call('GET', '/settings');
  assert.ok(calls.get - before <= 2);
});

test('a write from another instance is never silently overwritten', async () => {
  await call('GET', '/body-metrics'); // warm the cache
  // Simulate another serverless instance changing the file.
  const cur = blobs.get('forge/data/body_metrics.csv')!;
  blobs.set('forge/data/body_metrics.csv', { text: cur.text, etag: '"other-instance"' });
  // Our next transaction reads fresh (ETag differs) so it succeeds…
  assert.equal((await call('POST', '/body-metrics', { date: '2026-11-21', weight_kg: 80 })).status, 201);

  // …but a change landing between our read and our write is rejected with 409.
  const origPut = fake.put;
  fake.put = async (p, b, o) => {
    if (p === 'forge/data/body_metrics.csv' && o.ifMatch) {
      const c = blobs.get(p)!;
      blobs.set(p, { text: c.text, etag: '"raced"' });
    }
    return origPut(p, b, o);
  };
  const res = await call('POST', '/body-metrics', { date: '2026-11-21', weight_kg: 79.5 });
  fake.put = origPut;
  assert.equal(res.status, 409);
});

test('single-table CSV download works from blob storage', async () => {
  const res = await fetch(`${base}/data/export/workouts`, { headers: { Authorization: 'Bearer test-key-123' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') ?? '', /workouts\.csv/);
  assert.match(await res.text(), /^workout_id,date,workout_name/);
});
