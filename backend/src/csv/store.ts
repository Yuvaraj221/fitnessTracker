// CSV persistence layer — the only code in FORGE that reads or writes data.
//
// Guarantees:
//  * Reads always reflect the stored file (cached by version), so edits made
//    to the CSVs by hand are picked up without a restart.
//  * Writes are serialised through one process-wide lock, so concurrent
//    requests can never interleave and corrupt a file.
//  * Storage drivers stage writes before replacing anything: the filesystem
//    driver writes fsync'd temp files and atomically renames them; the Vercel
//    Blob driver uses ETags so a write never clobbers a newer version.
//  * Columns found in a file that are not in the schema are preserved.

import Papa from 'papaparse';
import { HttpError } from '../lib/errors';
import { ConflictError, storage } from '../storage';
import { TABLES, type ColumnType, type TableName } from './schema';

export type Row = Record<string, unknown>;

interface Snapshot {
  columns: string[];
  rows: Row[];
  version: string;
}

const cache = new Map<TableName, Snapshot>();

export const tableKey = (name: TableName) => `data/${TABLES[name].file}`;

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
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
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
  const hit = cache.get(name);
  const res = await storage().read(tableKey(name), hit?.version);
  if (!res) throw new HttpError(500, `${TABLES[name].file} is missing from storage. Restart FORGE to recreate it.`);
  if (res.notModified && hit) return hit;
  if (res.notModified) return readSnapshot(name);
  const { columns, rows } = parseCsv(name, res.text);
  const snap = { columns, rows, version: res.version };
  cache.set(name, snap);
  return snap;
}

/** Returns a copy of each row so callers can mutate freely. */
export async function readTable<T = Row>(name: TableName): Promise<T[]> {
  const snap = await readSnapshot(name);
  return snap.rows.map((r) => ({ ...r })) as T[];
}

/** The raw CSV text of a table (for downloads and backups). */
export async function readRaw(name: TableName): Promise<string | null> {
  const res = await storage().read(tableKey(name));
  return res && !res.notModified ? res.text : null;
}

// ------------------------------------------------------------------ writes

let lock: Promise<unknown> = Promise.resolve();

/** Runs `fn` exclusively: no other write in this process can happen until it settles. */
export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

export interface Transaction {
  read<T = Row>(name: TableName): Promise<T[]>;
  write(name: TableName, rows: Row[]): void;
}

const conflict = () =>
  new HttpError(409, 'Your data was changed from another tab or device at the same moment. Nothing was overwritten — reload and try again.');

/**
 * Read-modify-write across one or more tables under the write lock.
 * Staged writes are committed together when `fn` resolves; if `fn` throws,
 * nothing is written.
 */
export function transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return withWriteLock(async () => {
    const staged = new Map<TableName, Row[]>();
    const readVersions = new Map<TableName, Snapshot>();
    const tx: Transaction = {
      async read<R = Row>(name: TableName) {
        const s = staged.get(name);
        if (s) return s.map((r) => ({ ...r })) as R[];
        const snap = await readSnapshot(name);
        if (!readVersions.has(name)) readVersions.set(name, snap);
        return snap.rows.map((r) => ({ ...r })) as R[];
      },
      write(name, rows) {
        staged.set(name, rows);
      },
    };
    const result = await fn(tx);
    if (staged.size) {
      const ops = [];
      for (const [name, rows] of staged) {
        const snap = readVersions.get(name) ?? (await readSnapshot(name));
        ops.push({ key: tableKey(name), text: serializeCsv(snap.columns, rows), ifMatch: readVersions.get(name)?.version });
      }
      try {
        await storage().writeMany(ops);
      } catch (err) {
        if (err instanceof ConflictError) throw conflict();
        throw err;
      } finally {
        for (const name of staged.keys()) cache.delete(name);
      }
    }
    return result;
  });
}

/** Replace whole files with raw CSV text (restore/import). Caller must hold the lock. */
export async function replaceFilesRaw(files: Map<TableName, string>) {
  await storage().writeMany([...files].map(([name, text]) => ({ key: tableKey(name), text })));
  for (const name of files.keys()) cache.delete(name);
}

export function invalidateCache() {
  cache.clear();
}
