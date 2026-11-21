import type { MutationResult, UnlockedAchievement } from '@forge/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function parse(res: Response) {
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const message =
      json?.error?.message ??
      (res.status >= 500 || res.status === 0
        ? 'FORGE couldn’t reach its local server. Check that `npm run dev` is still running, then try again.'
        : `The request failed (${res.status}).`);
    throw new ApiError(message, res.status);
  }
  return json;
}

async function request(method: string, url: string, body?: unknown, raw?: BodyInit) {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: raw ? { 'Content-Type': 'application/zip' } : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError('FORGE couldn’t reach its local server. Check that `npm run dev` is still running, then try again.', 0);
  }
  return parse(res);
}

export const api = {
  get: async <T>(url: string): Promise<T> => (await request('GET', url)).data as T,
  /** Mutations return the saved data plus any achievements the change unlocked. */
  send: async <T>(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<MutationResult<T>> => {
    const json = await request(method, url, body);
    return { data: json?.data as T, unlocked: (json?.unlocked ?? []) as UnlockedAchievement[] };
  },
  upload: async <T>(url: string, file: Blob): Promise<MutationResult<T>> => {
    const json = await request('POST', url, undefined, file);
    return { data: json?.data as T, unlocked: (json?.unlocked ?? []) as UnlockedAchievement[] };
  },
};
