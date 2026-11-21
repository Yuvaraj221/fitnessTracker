import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (backend/src -> ../..). */
export const ROOT_DIR = path.resolve(here, '..', '..');
export const DATA_DIR = path.resolve(process.env.FORGE_DATA_DIR ?? path.join(ROOT_DIR, 'data'));
export const BACKUP_DIR = path.resolve(process.env.FORGE_BACKUP_DIR ?? path.join(ROOT_DIR, 'backups'));
export const PORT = Number(process.env.FORGE_API_PORT ?? 4000);
/** Automatic (pre-delete / pre-restore) backups kept; manual backups are never pruned. */
export const AUTO_BACKUP_RETENTION = Number(process.env.FORGE_AUTO_BACKUP_RETENTION ?? 40);
