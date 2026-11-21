import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** True when running inside a Vercel serverless function. */
export const ON_VERCEL = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;

/** Repository root (backend/src or backend/dist -> ../..). */
export const ROOT_DIR = path.resolve(here, '..', '..');

// On Vercel the deployment filesystem is read-only; only the OS temp dir is writable.
const defaultData = ON_VERCEL ? path.join(os.tmpdir(), 'forge', 'data') : path.join(ROOT_DIR, 'data');
const defaultBackups = ON_VERCEL ? path.join(os.tmpdir(), 'forge', 'backups') : path.join(ROOT_DIR, 'backups');

export const DATA_DIR = path.resolve(process.env.FORGE_DATA_DIR ?? defaultData);
export const BACKUP_DIR = path.resolve(process.env.FORGE_BACKUP_DIR ?? defaultBackups);
export const PORT = Number(process.env.FORGE_API_PORT ?? process.env.PORT ?? 4000);
/** Automatic (pre-delete / pre-restore) backups kept; manual backups are never pruned. */
export const AUTO_BACKUP_RETENTION = Number(process.env.FORGE_AUTO_BACKUP_RETENTION ?? 40);

/** `filesystem` | `blob`. Defaults to blob when a Vercel Blob token is present. */
export const STORAGE = (process.env.FORGE_STORAGE ?? (process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'filesystem')).toLowerCase();
export const BLOB_PREFIX = (process.env.FORGE_BLOB_PREFIX ?? 'forge/').replace(/^\/+/, '');
export const BLOB_ACCESS = process.env.FORGE_BLOB_ACCESS === 'public' ? 'public' : 'private';

/** Optional shared secret. When set, every API call (except /api/health) must send it. */
export const ACCESS_KEY = process.env.FORGE_ACCESS_KEY?.trim() || '';

/**
 * Seed demo data when the store is completely empty. Defaults to on for Vercel
 * (so a fresh deployment isn't blank) and off locally, where the repo already
 * ships CSV files.
 */
export const SEED_SAMPLE_DATA = process.env.FORGE_SEED_SAMPLE_DATA ? process.env.FORGE_SEED_SAMPLE_DATA === 'true' : ON_VERCEL;
