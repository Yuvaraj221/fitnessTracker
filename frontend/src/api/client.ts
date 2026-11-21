import type { MutationResult, UnlockedAchievement } from '@forge/shared';
import { getAccessKey, UNAUTHORIZED_EVENT } from '../lib/accessKey';

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
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) {
    const message =
      json?.error?.message ??
      (res.status >= 500 || res.status === 0
        ? SERVER_UNREACHABLE
        : `The request failed (${res.status}).`);
    throw new ApiError(message, res.status);
  }
  return json;
}

const SERVER_UNREACHABLE = import.meta.env.DEV
  ? 'FORGE couldn’t reach its local server. Check that `npm run dev` is still running, then try again.'
  : 'FORGE couldn’t reach its server. Check your connection and try again.';

export function authHeaders(): Record<string, string> {
  const key = getAccessKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function request(method: string, url: string, body?: unknown, raw?: BodyInit) {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: {
        ...authHeaders(),
        ...(raw ? { 'Content-Type': 'application/zip' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(SERVER_UNREACHABLE, 0);
  }
  return parse(res);
}

/** Downloads a file from the API (with the access key) and saves it in the browser. */
export async function download(url: string, fallbackName: string) {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, { headers: authHeaders() });
  } catch {
    throw new ApiError(SERVER_UNREACHABLE, 0);
  }
  if (!res.ok) await parse(res);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export interface HealthInfo {
  ok: boolean;
  storage: { kind: 'filesystem' | 'vercel-blob'; persistent: boolean };
  accessKeyRequired: boolean;
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
