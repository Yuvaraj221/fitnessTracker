import express, { Router } from 'express';
import { TABLE_LIST, TABLES, type TableName } from '../csv/schema';
import { readRaw, readTable, withWriteLock } from '../csv/store';
import { storage } from '../storage';
import { notFound } from '../lib/errors';
import { sendMutation } from '../lib/respond';
import { createBackup, deleteBackup, exportZip, importZip, listBackups, restoreBackup } from '../services/backup';
import { removeSampleData, sampleRowCount } from '../services/sample';

export const dataRouter = Router();

dataRouter.get('/info', async (_req, res) => {
  const tables = await Promise.all(
    TABLE_LIST.map(async (t) => ({ name: t.name, file: t.file, rows: (await readTable(t.name)).length })),
  );
  const s = storage();
  res.json({ data: { dataDir: s.location, storage: { kind: s.kind, persistent: s.persistent }, tables, sampleRows: await sampleRowCount() } });
});

dataRouter.get('/backups', async (_req, res) => {
  res.json({ data: await listBackups() });
});

dataRouter.post('/backups', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : 'manual backup';
  res.status(201).json({ data: await withWriteLock(() => createBackup(reason, 'manual')) });
});

dataRouter.post('/backups/:id/restore', async (req, res) => {
  const manifest = await restoreBackup(req.params.id);
  await sendMutation(res, manifest);
});

dataRouter.delete('/backups/:id', async (req, res) => {
  await deleteBackup(req.params.id);
  res.json({ data: { id: req.params.id } });
});

dataRouter.get('/export', async (_req, res) => {
  const zip = await exportZip();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="forge-export-${date}.zip"`);
  res.send(zip);
});

dataRouter.get('/export/:table', async (req, res) => {
  const name = req.params.table.replace(/\.csv$/, '') as TableName;
  if (!(name in TABLES)) throw notFound('Data file');
  const text = await readRaw(name);
  if (text == null) throw notFound('Data file');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${TABLES[name].file}"`);
  res.send(text);
});

dataRouter.post('/import', express.raw({ type: () => true, limit: '25mb' }), async (req, res) => {
  const tables = await importZip(req.body as Buffer);
  await sendMutation(res, { tables });
});

dataRouter.delete('/sample-data', async (_req, res) => {
  await sendMutation(res, await removeSampleData());
});
