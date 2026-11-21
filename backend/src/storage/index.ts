import { BACKUP_DIR, BLOB_ACCESS, BLOB_PREFIX, DATA_DIR, ON_VERCEL, STORAGE } from '../config';
import { BlobDriver } from './blob';
import { FilesystemDriver } from './filesystem';
import type { StorageDriver } from './types';

export * from './types';

let driver: StorageDriver | null = null;

/** The active storage driver, chosen once from the environment. */
export function storage(): StorageDriver {
  if (driver) return driver;
  if (STORAGE === 'blob') driver = new BlobDriver(BLOB_PREFIX, BLOB_ACCESS);
  else driver = new FilesystemDriver(DATA_DIR, BACKUP_DIR, !ON_VERCEL);
  return driver;
}

/** Test hook: swap in a different driver. */
export function setStorage(d: StorageDriver | null) {
  driver = d;
}
