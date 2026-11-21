import express, { type NextFunction, type Request, type Response } from 'express';
import { DATA_DIR } from './config';
import { HttpError } from './lib/errors';
import { achievementsRouter } from './routes/achievements';
import { dataRouter } from './routes/data';
import { bodyMetricsRouter, mealsRouter } from './routes/resources';
import { settingsRouter } from './routes/settings';
import { workoutsRouter } from './routes/workouts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ data: { ok: true, dataDir: DATA_DIR } });
  });
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
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { message: 'The request body was not valid JSON.' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { message: 'The server hit an unexpected problem. Your data files were not changed.' } });
  });
  return app;
}
