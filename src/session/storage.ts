import type { RoomState } from '../engine/types';

/**
 * Persistence. Everything lives in localStorage, but keys are namespaced by a
 * per-tab id kept in sessionStorage, which survives a refresh but not a new
 * tab. That way two windows in the same browser are two different players
 * (and a guest tab never tries to resume a host's room), while a refresh
 * still finds its own session.
 */

const PREFIX = 'sudoku-mash:';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function safeGet(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(store: Storage | undefined, key: string, value: string) {
  try {
    store?.setItem(key, value);
  } catch {
    // Storage full or blocked: the game still works, it just can't resume.
  }
}

function safeRemove(store: Storage | undefined, key: string) {
  try {
    store?.removeItem(key);
  } catch {
    // ignore
  }
}

const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

let memoryTabId: string | null = null;

function tabId(): string {
  const existing = safeGet(session(), `${PREFIX}tab`);
  if (existing) return existing;
  memoryTabId ??= crypto.randomUUID();
  safeSet(session(), `${PREFIX}tab`, memoryTabId);
  return memoryTabId;
}

const key = (name: string) => `${PREFIX}${tabId()}:${name}`;

interface Stamped<T> {
  savedAt: number;
  value: T;
}

function read<T>(name: string): T | null {
  const raw = safeGet(local(), key(name));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stamped<T>;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      safeRemove(local(), key(name));
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

function write<T>(name: string, value: T) {
  safeSet(local(), key(name), JSON.stringify({ savedAt: Date.now(), value } satisfies Stamped<T>));
}

/** This tab's player session id; the host uses it to recognise a reconnecting player. */
export function getSessionId(): string {
  const existing = read<string>('session');
  const id = existing ?? crypto.randomUUID();
  write('session', id); // refresh the timestamp
  return id;
}

export interface SavedHost {
  name: string;
  state: RoomState;
}

export const loadHost = () => read<SavedHost>('host');
export const saveHost = (saved: SavedHost) => write('host', saved);
export const clearHost = () => safeRemove(local(), key('host'));

export interface SavedGuest {
  code: string;
  name: string;
}

export const loadGuest = () => read<SavedGuest>('guest');
export const saveGuest = (saved: SavedGuest) => write('guest', saved);
export const clearGuest = () => safeRemove(local(), key('guest'));

export const loadName = () => read<string>('name') ?? '';
export const saveName = (name: string) => write('name', name);

export type ThemeChoice = 'dark' | 'light';
export const loadTheme = (): ThemeChoice => (safeGet(local(), `${PREFIX}theme`) === 'light' ? 'light' : 'dark');
export const saveTheme = (theme: ThemeChoice) => safeSet(local(), `${PREFIX}theme`, theme);

/** Drops other tabs' entries that have expired, so storage doesn't grow forever. */
export function pruneExpired() {
  const store = local();
  if (!store) return;
  try {
    const now = Date.now();
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (!k?.startsWith(PREFIX) || k === `${PREFIX}theme`) continue;
      try {
        const { savedAt } = JSON.parse(store.getItem(k) ?? '{}') as Partial<Stamped<unknown>>;
        if (!savedAt || now - savedAt > MAX_AGE_MS) store.removeItem(k);
      } catch {
        store.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}
