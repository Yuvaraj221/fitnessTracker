// Storage drivers hold FORGE's CSV files. Keys are POSIX-style paths:
//   data/<table>.csv                 — live data
//   backups/<backup-id>/<file>       — backup snapshots
// The CSV format is identical whichever driver is used.

export type ReadResult =
  | { text: string; version: string; notModified?: false }
  | { notModified: true; version: string };

export interface WriteOp {
  key: string;
  text: string;
  /** Only write if the stored file still has this version (optimistic concurrency). */
  ifMatch?: string;
  /** Only write if the file doesn't exist yet; silently skip otherwise. */
  createOnly?: boolean;
}

export interface StorageDriver {
  readonly kind: 'filesystem' | 'vercel-blob';
  /** False when data will be lost (e.g. /tmp on a serverless instance). */
  readonly persistent: boolean;
  /** Human-readable location shown in Settings. */
  readonly location: string;
  /** Returns null if the key doesn't exist; `notModified` if it still matches `ifNoneMatch`. */
  read(key: string, ifNoneMatch?: string): Promise<ReadResult | null>;
  /** Writes every file. Implementations stage as much as they can before replacing anything. */
  writeMany(ops: WriteOp[]): Promise<void>;
  /** All keys under a prefix (recursive). */
  list(prefix: string): Promise<string[]>;
  remove(keys: string[]): Promise<void>;
  /** One-time housekeeping at startup (e.g. removing interrupted temp files). */
  prepare?(): Promise<void>;
}

export class ConflictError extends Error {}

export async function readText(driver: StorageDriver, key: string): Promise<string | null> {
  const r = await driver.read(key);
  return r && !r.notModified ? r.text : null;
}
