// Generic CRUD router for flat, single-table resources (meals, body metrics).

import { inRange } from '@forge/shared';
import { Router } from 'express';
import type { z } from 'zod';
import type { TableName } from '../csv/schema';
import { readTable, transaction, type Row } from '../csv/store';
import { notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { sendMutation } from '../lib/respond';
import { validate } from '../lib/validation';
import { createBackup } from '../services/backup';

interface CrudOptions<T extends { date: string }> {
  table: TableName;
  key: keyof T & string;
  idPrefix: string;
  label: string;
  schema: z.ZodType<Omit<T, never>>;
  describe: (row: T) => string;
}

export function crudRouter<T extends { date: string }>(opts: CrudOptions<T>) {
  const router = Router();
  const idOf = (r: T) => String(r[opts.key]);

  router.get('/', async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : null;
    const to = typeof req.query.to === 'string' ? req.query.to : null;
    const rows = (await readTable<T>(opts.table)).filter((r) => inRange(r.date, from, to));
    rows.sort((a, b) => b.date.localeCompare(a.date));
    res.json({ data: rows });
  });

  router.post('/', async (req, res) => {
    const input = validate(opts.schema, req.body) as T;
    const row = { ...input, [opts.key]: newId(opts.idPrefix) } as T;
    await transaction(async (tx) => {
      tx.write(opts.table, [...(await tx.read(opts.table)), row as unknown as Row]);
    });
    await sendMutation(res, row, 201);
  });

  router.put('/:id', async (req, res) => {
    const input = validate(opts.schema, req.body) as T;
    const row = await transaction(async (tx) => {
      const rows = await tx.read<T>(opts.table);
      const idx = rows.findIndex((r) => idOf(r) === req.params.id);
      if (idx < 0) throw notFound(opts.label);
      const next = { ...rows[idx], ...input, [opts.key]: req.params.id } as T;
      rows[idx] = next;
      tx.write(opts.table, rows as unknown as Row[]);
      return next;
    });
    await sendMutation(res, row);
  });

  router.delete('/:id', async (req, res) => {
    const removed = await transaction(async (tx) => {
      const rows = await tx.read<T>(opts.table);
      const target = rows.find((r) => idOf(r) === req.params.id);
      if (!target) throw notFound(opts.label);
      await createBackup(`before deleting ${opts.describe(target)}`);
      tx.write(opts.table, rows.filter((r) => idOf(r) !== req.params.id) as unknown as Row[]);
      return target;
    });
    await sendMutation(res, removed);
  });

  return router;
}
