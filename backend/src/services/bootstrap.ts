// One-time startup work, shared by the local server and the Vercel function.
// On serverless platforms this runs lazily on the first request of each
// instance (a "cold start") and is memoised afterwards.

import { SEED_SAMPLE_DATA } from '../config';
import { initDataFiles } from '../csv/init';
import { storage } from '../storage';
import { evaluateAndStore } from './achievements';
import { loadSampleData } from './sample';

let ready: Promise<void> | null = null;

export function ensureReady(log: (msg: string) => void = () => undefined): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const s = storage();
      log(`FORGE storage: ${s.kind} · ${s.location}${s.persistent ? '' : ' (temporary)'}`);
      const { created } = await initDataFiles(log);
      if (created && SEED_SAMPLE_DATA) {
        const r = await loadSampleData();
        log(`  seeded sample data: ${r.workouts} workouts, ${r.meals} food entries, ${r.bodyMetrics} body metrics`);
      }
      const fresh = await evaluateAndStore();
      if (fresh.length) log(`  ${fresh.length} achievement(s) unlocked from existing data`);
    })().catch((err) => {
      ready = null; // allow the next request to retry
      throw err;
    });
  }
  return ready;
}
