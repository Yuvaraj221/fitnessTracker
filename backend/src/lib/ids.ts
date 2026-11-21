import { randomBytes } from 'node:crypto';

/** Short, sortable, collision-resistant IDs such as `wo_mbx3k9a2f1c4e8`. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
}
