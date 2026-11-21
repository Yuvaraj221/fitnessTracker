import express, { type NextFunction, type Request, type Response } from 'express';
import { ACCESS_KEY } from './config';
import { HttpError } from './lib/errors';
import { requireAccessKey } from './lib/auth';
import { achievementsRouter } from './routes/achievements';
import { dataRouter } from './routes/data';
import { bodyMetricsRouter, mealsRouter } from './routes/resources';
import { settingsRouter } from './routes/settings';
import { workoutsRouter } from './routes/workouts';
import { ensureReady } from './services/bootstrap';
import { storage } from './storage';

export function createApp({ lazyInit = false }: { lazyInit?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  // Public: lets the UI know how storage and access are configured.
  app.get('/api/health', (_req, res) => {
    const s = storage();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: { ok: true, storage: { kind: s.kind, persistent: s.persistent }, accessKeyRequired: !!ACCESS_KEY } });
  });

  app.use('/api', requireAccessKey);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Serverless instances initialise on their first request.
  if (lazyInit) app.use('/api', (_req, _res, next) => ensureReady(console.log).then(() => next(), next));

  app.use('/api/workouts', workoutsRouter);
  app.use('/api/meals', mealsRouter);
  app.use('/api/body-metrics', bodyMetricsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/achievements', achievementsRouter);
  app.use('/api/data', dataRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { message: 'That API route does not exist.' } });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { message: err.message, details: err.details } });
      return;
    }
    const type = err && typeof err === 'object' && 'type' in err ? (err as { type: string }).type : '';
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: { message: 'The request body was not valid JSON.' } });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ error: { message: 'That upload is too large. Exports up to 4 MB can be imported on Vercel.' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { message: 'The server hit an unexpected problem. Your data files were not changed.' } });
  });
  return app;
}
