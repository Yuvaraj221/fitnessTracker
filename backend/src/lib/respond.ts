import type { Response } from 'express';
import { evaluateAndStore } from '../services/achievements';

/** Sends `{ data, unlocked }` after re-evaluating achievements for the change. */
export async function sendMutation(res: Response, data: unknown, status = 200) {
  let unlocked: unknown[] = [];
  try {
    unlocked = await evaluateAndStore();
  } catch (err) {
    console.error('Achievement evaluation failed (the change itself was saved):', err);
  }
  res.status(status).json({ data, unlocked });
}
