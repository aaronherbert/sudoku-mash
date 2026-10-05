/** Every room's PeerJS id is this prefix plus its five-digit code. */
export const ROOM_PREFIX = 'sudoku-mash-';

export const peerIdFor = (code: string) => `${ROOM_PREFIX}${code}`;

/** A random five-digit room code, 10000-99999. */
export function randomCode(rng: () => number = Math.random): string {
  return String(10000 + Math.floor(rng() * 90000));
}

export const isRoomCode = (code: string) => /^[1-9]\d{4}$/.test(code);

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with jitter: 1s, 2s, 4s… capped at `maxMs`. */
export function backoffMs(attempt: number, baseMs = 1000, maxMs = 10_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp * (0.75 + Math.random() * 0.5));
}
