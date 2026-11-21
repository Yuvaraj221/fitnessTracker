// Backups are plain folders of CSV files under backups/, so they can be
// inspected or copied by hand. Automatic backups are taken before every
// destructive operation (delete, restore, import, sample-data removal).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { AUTO_BACKUP_RETENTION, BACKUP_DIR } from '../config';
import { TABLE_LIST, TABLES, type TableName } from '../csv/schema';
import { parseCsv, readTable, replaceFileRaw, tablePath, withWriteLock } from '../csv/store';
import { badRequest, notFound } from '../lib/errors';

export interface BackupManifest {
  id: string;
  created_at: string;
  kind: 'manual' | 'auto';
  reason: string;
  files: string[];
  row_counts: Record<string, number>;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'backup';

function stamp(d = new Date()) {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

/** Copies every CSV into a new backup folder. Safe to call while holding the write lock. */
export async function createBackup(reason: string, kind: 'manual' | 'auto' = 'auto'): Promise<BackupManifest> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const id = `${stamp()}_${kind}_${slug(reason)}`;
  const dir = path.join(BACKUP_DIR, id);
  await fs.mkdir(dir);
  const row_counts: Record<string, number> = {};
  const files: string[] = [];
  for (const t of TABLE_LIST) {
    try {
      await fs.copyFile(tablePath(t.name), path.join(dir, t.file));
      files.push(t.file);
      row_counts[t.name] = (await readTable(t.name)).length;
    } catch {
      // A missing file simply isn't included in the backup.
    }
  }
  const manifest: BackupManifest = { id, created_at: new Date().toISOString(), kind, reason, files, row_counts };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (kind === 'auto') await pruneAutoBackups();
  return manifest;
}

async function readManifest(id: string): Promise<BackupManifest | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(BACKUP_DIR, id, 'manifest.json'), 'utf8')) as BackupManifest;
  } catch {
    return null;
  }
}

export async function listBackups(): Promise<BackupManifest[]> {
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(BACKUP_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const manifests = await Promise.all(entries.map(readManifest));
  return manifests.filter((m): m is BackupManifest => !!m).sort((a, b) => b.id.localeCompare(a.id));
}

async function pruneAutoBackups() {
  const auto = (await listBackups()).filter((b) => b.kind === 'auto');
  for (const old of auto.slice(AUTO_BACKUP_RETENTION)) {
    await fs.rm(path.join(BACKUP_DIR, old.id), { recursive: true, force: true });
  }
}

const safeId = (id: string) => {
  if (!/^[\w.-]+$/.test(id)) throw badRequest('That backup name is not valid.');
  return id;
};

/** Validates every file first, then swaps them in. Takes a pre-restore backup. */
async function restoreFiles(files: Map<TableName, string>, reason: string) {
  for (const [name, text] of files) {
    const { columns } = parseCsv(name, text);
    if (!columns.includes(TABLES[name].key)) {
      throw badRequest(`${TABLES[name].file} is missing its "${TABLES[name].key}" column, so nothing was restored.`);
    }
  }
  await createBackup(reason, 'auto');
  for (const [name, text] of files) await replaceFileRaw(name, text);
}

export function restoreBackup(id: string) {
  return withWriteLock(async () => {
    const dir = path.join(BACKUP_DIR, safeId(id));
    const manifest = await readManifest(id);
    if (!manifest) throw notFound('Backup');
    const files = new Map<TableName, string>();
    for (const t of TABLE_LIST) {
      try {
        files.set(t.name, await fs.readFile(path.join(dir, t.file), 'utf8'));
      } catch {
        // Tables absent from the backup are left untouched.
      }
    }
    await restoreFiles(files, `before restoring ${id}`);
    return manifest;
  });
}

export async function deleteBackup(id: string) {
  const dir = path.join(BACKUP_DIR, safeId(id));
  if (!(await readManifest(id))) throw notFound('Backup');
  await fs.rm(dir, { recursive: true, force: true });
}

export async function exportZip(): Promise<Buffer> {
  const zip = new JSZip();
  for (const t of TABLE_LIST) {
    try {
      zip.file(t.file, await fs.readFile(tablePath(t.name)));
    } catch {
      /* skip missing */
    }
  }
  zip.file('forge-export.json', JSON.stringify({ app: 'FORGE', exported_at: new Date().toISOString() }, null, 2));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function importZip(buffer: Buffer) {
  return withWriteLock(async () => {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw badRequest('That file is not a readable .zip export. Choose a FORGE export file and try again.');
    }
    const files = new Map<TableName, string>();
    for (const t of TABLE_LIST) {
      const entry = zip.file(t.file) ?? zip.file(new RegExp(`(^|/)${t.file.replace('.', '\\.')}$`))[0];
      if (entry) files.set(t.name, await entry.async('string'));
    }
    if (!files.size) throw badRequest('No FORGE CSV files were found in that archive, so nothing was changed.');
    await restoreFiles(files, 'before import');
    return [...files.keys()];
  });
}
