// Startup checks. Creates missing CSV files with headers and adds missing
// columns / settings to existing files. Existing rows are never discarded:
// any file that needs changing is backed up first.

import { promises as fs } from 'node:fs';
import { DEFAULT_RULES, DEFAULT_SETTINGS } from '@forge/shared';
import { BACKUP_DIR, DATA_DIR } from '../config';
import { createBackup } from '../services/backup';
import { TABLE_LIST, TABLES, type TableName } from './schema';
import { parseCsv, serializeCsv, tablePath, type Row } from './store';

function defaultRows(name: TableName): Row[] {
  if (name === 'achievement_rules') return DEFAULT_RULES.map((r) => ({ ...r }));
  if (name === 'user_settings') {
    return Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ({ setting_key: k, setting_value: v == null ? '' : String(v) }));
  }
  return [];
}

export async function initDataFiles(log = console.log) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  // Remove temp files left behind by an interrupted write.
  for (const f of await fs.readdir(DATA_DIR)) {
    if (f.endsWith('.tmp')) await fs.rm(`${DATA_DIR}/${f}`, { force: true });
  }

  let backedUp = false;
  const backupOnce = async () => {
    if (!backedUp) await createBackup('before schema upgrade', 'auto');
    backedUp = true;
  };

  for (const t of TABLE_LIST) {
    const file = tablePath(t.name);
    let text: string | null = null;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      /* missing */
    }

    if (text === null) {
      await fs.writeFile(file, serializeCsv(Object.keys(t.columns), defaultRows(t.name)));
      log(`  created ${t.file}`);
      continue;
    }

    const headerLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
    const present = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const missing = Object.keys(t.columns).filter((c) => !present.includes(c));
    let { columns, rows } = parseCsv(t.name, text);
    let changed = missing.length > 0 && headerLine.trim() !== '';
    if (headerLine.trim() === '') changed = true; // empty file: write the header

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
      await fs.writeFile(file, serializeCsv(columns, rows));
      log(`  upgraded ${t.file}${missing.length ? ` (added columns: ${missing.join(', ')})` : ''}`);
    }
  }
  return TABLES;
}
