// Startup checks. Creates missing CSV files with headers and adds missing
// columns / settings to existing files. Existing rows are never discarded:
// any file that needs changing is backed up first.

import { DEFAULT_RULES, DEFAULT_SETTINGS } from '@forge/shared';
import { createBackup } from '../services/backup';
import { storage } from '../storage';
import { TABLE_LIST, type TableName } from './schema';
import { invalidateCache, parseCsv, serializeCsv, tableKey, type Row } from './store';

function defaultRows(name: TableName): Row[] {
  if (name === 'achievement_rules') return DEFAULT_RULES.map((r) => ({ ...r }));
  if (name === 'user_settings') {
    return Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ({ setting_key: k, setting_value: v == null ? '' : String(v) }));
  }
  return [];
}

/** Returns `created: true` when every file was missing (a brand-new store). */
export async function initDataFiles(log = console.log): Promise<{ created: boolean }> {
  const store = storage();
  await store.prepare?.();

  let backedUp = false;
  const backupOnce = async () => {
    if (!backedUp) await createBackup('before schema upgrade', 'auto');
    backedUp = true;
  };

  let missingCount = 0;
  for (const t of TABLE_LIST) {
    const key = tableKey(t.name);
    const res = await store.read(key);
    const text = res && !res.notModified ? res.text : null;

    if (text === null) {
      missingCount += 1;
      await store.writeMany([{ key, text: serializeCsv(Object.keys(t.columns), defaultRows(t.name)), createOnly: true }]);
      log(`  created ${t.file}`);
      continue;
    }

    const headerLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
    const present = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const missing = Object.keys(t.columns).filter((c) => !present.includes(c));
    const parsed = parseCsv(t.name, text);
    let rows = parsed.rows;
    let changed = missing.length > 0 || headerLine.trim() === '';

    if (t.name === 'user_settings') {
      const keys = new Set(rows.map((r) => String(r.setting_key)));
      const add = defaultRows('user_settings').filter((r) => !keys.has(String(r.setting_key)));
      if (add.length) {
        rows = [...rows, ...add];
        changed = true;
      }
    }

    if (changed) {
      if (rows.length) await backupOnce();
      await store.writeMany([{ key, text: serializeCsv(parsed.columns, rows), ifMatch: res!.version }]);
      log(`  upgraded ${t.file}${missing.length ? ` (added columns: ${missing.join(', ')})` : ''}`);
    }
  }
  invalidateCache();
  return { created: missingCount === TABLE_LIST.length };
}
