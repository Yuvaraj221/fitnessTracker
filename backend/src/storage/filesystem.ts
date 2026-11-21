// Local filesystem driver: the default when running on your own computer.
// Writes go to a temp file that is fsync'd, then atomically renamed into place.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ReadResult, StorageDriver, WriteOp } from './types';

export class FilesystemDriver implements StorageDriver {
  readonly kind = 'filesystem' as const;

  constructor(
    private dataDir: string,
    private backupDir: string,
    readonly persistent = true,
  ) {}

  get location() {
    return this.dataDir;
  }

  private resolve(key: string): string {
    const [root, ...rest] = key.split('/');
    if (rest.some((p) => p === '..' || p === '')) throw new Error(`Invalid storage key: ${key}`);
    const base = root === 'data' ? this.dataDir : root === 'backups' ? this.backupDir : null;
    if (!base) throw new Error(`Unknown storage area: ${key}`);
    return path.join(base, ...rest);
  }

  async read(key: string, ifNoneMatch?: string): Promise<ReadResult | null> {
    const file = this.resolve(key);
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      return null;
    }
    const version = `${stat.mtimeMs}-${stat.size}`;
    if (ifNoneMatch && ifNoneMatch === version) return { notModified: true, version };
    return { text: await fs.readFile(file, 'utf8'), version };
  }

  async writeMany(ops: WriteOp[]): Promise<void> {
    const staged: { tmp: string; target: string }[] = [];
    try {
      for (const op of ops) {
        const target = this.resolve(op.key);
        if (op.createOnly && (await fs.stat(target).then(() => true, () => false))) continue;
        await fs.mkdir(path.dirname(target), { recursive: true });
        const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
        const handle = await fs.open(tmp, 'w');
        try {
          await handle.writeFile(op.text, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        staged.push({ tmp, target });
      }
    } catch (err) {
      await Promise.all(staged.map((s) => fs.rm(s.tmp, { force: true })));
      throw err;
    }
    for (const s of staged) await fs.rename(s.tmp, s.target);
  }

  async list(prefix: string): Promise<string[]> {
    const root = prefix.split('/')[0];
    const dir = this.resolve(prefix.replace(/\/$/, '') || root);
    const out: string[] = [];
    const walk = async (abs: string, rel: string) => {
      let entries;
      try {
        entries = await fs.readdir(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(path.join(abs, e.name), r);
        else out.push(r);
      }
    };
    const base = prefix.replace(/\/$/, '');
    await walk(dir, base);
    return out;
  }

  async remove(keys: string[]): Promise<void> {
    const dirs = new Set<string>();
    for (const k of keys) {
      const file = this.resolve(k);
      await fs.rm(file, { force: true });
      dirs.add(path.dirname(file));
    }
    // Tidy up now-empty backup folders.
    for (const d of dirs) {
      if (d === this.dataDir || d === this.backupDir) continue;
      try {
        await fs.rmdir(d);
      } catch {
        /* not empty */
      }
    }
  }

  async prepare(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
    for (const f of await fs.readdir(this.dataDir)) {
      if (f.endsWith('.tmp')) await fs.rm(path.join(this.dataDir, f), { force: true });
    }
  }
}
