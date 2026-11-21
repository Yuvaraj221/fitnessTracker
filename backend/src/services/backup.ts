// Backups are plain folders of CSV files (backups/<id>/*.csv + manifest.json)
// in whichever storage FORGE uses, so they can be inspected or copied by hand.
// Automatic backups are taken before every destructive operation
// (delete, restore, import, sample-data removal).

import JSZip from 'jszip';
import { AUTO_BACKUP_RETENTION } from '../config';
import { TABLE_LIST, TABLES, type TableName } from '../csv/schema';
import { parseCsv, readRaw, replaceFilesRaw, withWriteLock } from '../csv/store';
import { badRequest, notFound } from '../lib/errors';
import { readText, storage } from '../storage';

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
  const id = `${stamp()}_${kind}_${slug(reason)}`;
  const ops: { key: string; text: string }[] = [];
  const row_counts: Record<string, number> = {};
  for (const t of TABLE_LIST) {
    const text = await readRaw(t.name);
    if (text == null) continue; // a missing file simply isn't included
    ops.push({ key: `backups/${id}/${t.file}`, text });
    row_counts[t.name] = parseCsv(t.name, text).rows.length;
  }
  const manifest: BackupManifest = { id, created_at: new Date().toISOString(), kind, reason, files: ops.map((o) => o.key.split('/').pop()!), row_counts };
  ops.push({ key: `backups/${id}/manifest.json`, text: JSON.stringify(manifest, null, 2) });
  await storage().writeMany(ops);
  if (kind === 'auto') await pruneAutoBackups();
  return manifest;
}

async function readManifest(id: string): Promise<BackupManifest | null> {
  try {
    const text = await readText(storage(), `backups/${id}/manifest.json`);
    return text ? (JSON.parse(text) as BackupManifest) : null;
  } catch {
    return null;
  }
}

/** Backup ids, newest first (ids start with a sortable timestamp). */
async function backupIds(): Promise<{ id: string; keys: string[] }[]> {
  const byId = new Map<string, string[]>();
  for (const key of await storage().list('backups/')) {
    const [, id] = key.split('/');
    if (!id || key.split('/').length < 3) continue;
    const list = byId.get(id) ?? [];
    list.push(key);
    byId.set(id, list);
  }
  return [...byId.entries()].map(([id, keys]) => ({ id, keys })).sort((a, b) => b.id.localeCompare(a.id));
}

export async function listBackups(): Promise<BackupManifest[]> {
  const ids = await backupIds();
  const manifests = await Promise.all(ids.map((b) => readManifest(b.id)));
  return manifests.filter((m): m is BackupManifest => !!m);
}

async function pruneAutoBackups() {
  const auto = (await backupIds()).filter((b) => b.id.includes('_auto_'));
  const old = auto.slice(AUTO_BACKUP_RETENTION).flatMap((b) => b.keys);
  if (old.length) await storage().remove(old);
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
  await replaceFilesRaw(files);
}

export function restoreBackup(id: string) {
  return withWriteLock(async () => {
    safeId(id);
    const manifest = await readManifest(id);
    if (!manifest) throw notFound('Backup');
    const files = new Map<TableName, string>();
    for (const t of TABLE_LIST) {
      const text = await readText(storage(), `backups/${id}/${t.file}`);
      if (text != null) files.set(t.name, text); // tables absent from the backup are left untouched
    }
    await restoreFiles(files, `before restoring ${id}`);
    return manifest;
  });
}

export async function deleteBackup(id: string) {
  safeId(id);
  const entry = (await backupIds()).find((b) => b.id === id);
  if (!entry) throw notFound('Backup');
  await storage().remove(entry.keys);
}

export async function exportZip(): Promise<Buffer> {
  const zip = new JSZip();
  for (const t of TABLE_LIST) {
    const text = await readRaw(t.name);
    if (text != null) zip.file(t.file, text);
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
