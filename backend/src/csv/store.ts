// CSV persistence layer — the only code in FORGE that touches data files.
//
// Guarantees:
//  * Reads always reflect the file on disk (cached by mtime + size), so edits
//    made to the CSVs by hand are picked up without a restart.
//  * Writes are serialised through one process-wide lock, so concurrent
//    requests can never interleave and corrupt a file.
//  * Each write goes to a temporary file that is fsync'd and then atomically
//    renamed over the original. A multi-file transaction stages every temp
//    file before renaming any of them.
//  * Columns found in a file that are not in the schema are preserved.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { DATA_DIR } from '../config';
import { TABLES, type ColumnType, type TableName } from './schema';

export type Row = Record<string, unknown>;

interface Snapshot {
  columns: string[];
  rows: Row[];
  mtimeMs: number;
  size: number;
}

const cache = new Map<TableName, Snapshot>();

export const tablePath = (name: TableName) => path.join(DATA_DIR, TABLES[name].file);

// ------------------------------------------------------------------ coercion

function parseCell(raw: string | undefined, type: ColumnType): unknown {
  const v = raw ?? '';
  switch (type) {
    case 'string':
      return v;
    case 'bool':
      return /^(true|1|yes)$/i.test(v.trim());
    case 'int':
    case 'number': {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t);
      if (!Number.isFinite(n)) return null;
      return type === 'int' ? Math.round(n) : n;
    }
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v);
}

export function parseCsv(name: TableName, text: string): { columns: string[]; rows: Row[] } {
  const schema = TABLES[name].columns;
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  const header = (parsed.meta.fields ?? []).filter(Boolean);
  const columns = [...Object.keys(schema), ...header.filter((h) => !(h in schema))];
  const rows = parsed.data.map((raw) => {
    const row: Row = {};
    for (const c of columns) row[c] = parseCell(raw[c], schema[c] ?? 'string');
    return row;
  });
  return { columns, rows };
}

export function serializeCsv(columns: string[], rows: Row[]): string {
  const body = Papa.unparse(
    { fields: columns, data: rows.map((r) => columns.map((c) => formatCell(r[c]))) },
    { newline: '\n', quotes: false, header: true },
  );
  return body.endsWith('\n') ? body : `${body}\n`;
}

// ------------------------------------------------------------------ reads

export async function readSnapshot(name: TableName): Promise<Snapshot> {
  const file = tablePath(name);
  const stat = await fs.stat(file);
  const hit = cache.get(name);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
  const text = await fs.readFile(file, 'utf8');
  const { columns, rows } = parseCsv(name, text);
  const snap = { columns, rows, mtimeMs: stat.mtimeMs, size: stat.size };
  cache.set(name, snap);
  return snap;
}

/** Returns a deep-ish copy so callers can mutate freely. */
export async function readTable<T = Row>(name: TableName): Promise<T[]> {
  const snap = await readSnapshot(name);
  return snap.rows.map((r) => ({ ...r })) as T[];
}

// ------------------------------------------------------------------ writes

let lock: Promise<unknown> = Promise.resolve();

/** Runs `fn` exclusively: no other write can happen until it settles. */
export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function writeTemp(target: string, contents: string): Promise<string> {
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return tmp;
}

export interface Transaction {
  read<T = Row>(name: TableName): Promise<T[]>;
  write(name: TableName, rows: Row[]): void;
}

/**
 * Read-modify-write across one or more tables under the global write lock.
 * Staged writes are committed together when `fn` resolves; if `fn` throws,
 * nothing is written.
 */
export function transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return withWriteLock(async () => {
    const staged = new Map<TableName, Row[]>();
    const tx: Transaction = {
      async read<R = Row>(name: TableName) {
        const s = staged.get(name);
        if (s) return s.map((r) => ({ ...r })) as R[];
        return readTable<R>(name);
      },
      write(name, rows) {
        staged.set(name, rows);
      },
    };
    const result = await fn(tx);
    await commit(staged);
    return result;
  });
}

async function commit(staged: Map<TableName, Row[]>) {
  const temps: { tmp: string; target: string; name: TableName }[] = [];
  try {
    for (const [name, rows] of staged) {
      const snap = await readSnapshot(name);
      const target = tablePath(name);
      temps.push({ tmp: await writeTemp(target, serializeCsv(snap.columns, rows)), target, name });
    }
  } catch (err) {
    await Promise.all(temps.map((t) => fs.rm(t.tmp, { force: true })));
    throw err;
  }
  for (const t of temps) {
    await fs.rename(t.tmp, t.target);
    cache.delete(t.name);
  }
}

/** Atomically replace a whole file with raw text (used by restore/import). Caller must hold the lock. */
export async function replaceFileRaw(name: TableName, text: string) {
  const target = tablePath(name);
  const tmp = await writeTemp(target, text);
  await fs.rename(tmp, target);
  cache.delete(name);
}

export function invalidateCache() {
  cache.clear();
}
