import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ACCESS_KEY } from '../config';

const matches = (given: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(ACCESS_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Optional access protection for deployments. When FORGE_ACCESS_KEY is set,
 * every API request must send `Authorization: Bearer <key>`. Locally the
 * variable is unset and nothing changes.
 */
export function requireAccessKey(req: Request, res: Response, next: NextFunction) {
  if (!ACCESS_KEY) return next();
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token && matches(token)) return next();
  res.status(401).json({ error: { message: 'Enter your FORGE access key to continue.', code: 'access_key_required' } });
}
