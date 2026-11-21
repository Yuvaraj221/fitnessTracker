// Vercel Blob driver: used when deployed on Vercel with a Blob store connected
// (BLOB_READ_WRITE_TOKEN is set). Each CSV is stored as one private blob, so
// the data stays plain CSV and survives deployments and cold starts.
//
// Serverless instances don't share memory, so the in-process write lock can't
// serialise writes across instances. Every write therefore uses the blob's
// ETag (`ifMatch`): if another instance changed a file in between, the write
// is rejected with a ConflictError instead of silently overwriting it.

import * as blobSdk from '@vercel/blob';
import { ConflictError, type ReadResult, type StorageDriver, type WriteOp } from './types';

/** The subset of @vercel/blob used here; injectable so it can be tested offline. */
export interface BlobClient {
  get: typeof blobSdk.get;
  put: typeof blobSdk.put;
  list: typeof blobSdk.list;
  del: typeof blobSdk.del;
}

export class BlobDriver implements StorageDriver {
  readonly kind = 'vercel-blob' as const;
  readonly persistent = true;

  constructor(
    private prefix: string,
    private access: 'private' | 'public' = 'private',
    private client: BlobClient = blobSdk,
  ) {}

  get location() {
    return `Vercel Blob · ${this.prefix || '/'} (${this.access})`;
  }

  private path(key: string) {
    return `${this.prefix}${key}`;
  }

  async read(key: string, ifNoneMatch?: string): Promise<ReadResult | null> {
    const res = await this.client.get(this.path(key), { access: this.access, useCache: false, ifNoneMatch });
    if (!res) return null;
    if (res.statusCode === 304) return { notModified: true, version: res.blob.etag };
    const text = await new Response(res.stream).text();
    return { text, version: res.blob.etag };
  }

  async writeMany(ops: WriteOp[]): Promise<void> {
    for (const op of ops) {
      try {
        await this.client.put(this.path(op.key), op.text, {
          access: this.access,
          addRandomSuffix: false,
          allowOverwrite: !op.createOnly,
          contentType: op.key.endsWith('.json') ? 'application/json' : 'text/csv; charset=utf-8',
          cacheControlMaxAge: 60,
          ...(op.ifMatch ? { ifMatch: op.ifMatch } : {}),
        });
      } catch (err) {
        if (op.createOnly && isAlreadyExists(err)) continue; // another instance created it first
        if (op.ifMatch && isPreconditionFailure(err)) {
          throw new ConflictError(`${op.key} was changed by another request.`);
        }
        throw err;
      }
    }
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.list({ prefix: this.path(prefix), cursor, limit: 1000 });
      for (const b of page.blobs) out.push(b.pathname.slice(this.prefix.length));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }

  async remove(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 100) {
      await this.client.del(keys.slice(i, i + 100).map((k) => this.path(k)));
    }
  }
}

function isPreconditionFailure(err: unknown): boolean {
  if (err instanceof blobSdk.BlobPreconditionFailedError) return true;
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; status?: number; statusCode?: number };
  return (
    e.status === 412 ||
    e.statusCode === 412 ||
    /precondition/i.test(e.name ?? '') ||
    /precondition|etag|if-?match/i.test(e.message ?? '')
  );
}

function isAlreadyExists(err: unknown): boolean {
  const msg = err && typeof err === 'object' ? String((err as { message?: string }).message ?? '') : '';
  return /already exists/i.test(msg);
}
