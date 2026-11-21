// The optional deployment access key (FORGE_ACCESS_KEY) is remembered on this
// device only. Storage may be unavailable (private mode), so every access is guarded.
const KEY = 'forge.accessKey';

export function getAccessKey(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return memory;
  }
}

let memory = '';
export function setAccessKey(value: string) {
  memory = value;
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: keep it in memory for this tab */
  }
}

export const UNAUTHORIZED_EVENT = 'forge:unauthorized';
