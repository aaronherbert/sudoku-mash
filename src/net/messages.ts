import type { Difficulty, PublicState, RoundResult } from '../engine/types';

/** Guest -> host. Everything a guest can ask for. */
export type ClientMessage =
  | { type: 'join'; sessionId: string; name: string }
  | { type: 'move'; index: number; value: number }
  | { type: 'leave' }
  | { type: 'ping' };

/** Host-only actions. The host's UI sends these straight to the engine; guests can't. */
export type HostAction =
  | { type: 'set-difficulty'; difficulty: Difficulty }
  | { type: 'begin-round' }
  | { type: 'end-game' };

export type JoinRejectReason = 'full' | 'closed' | 'invalid';
export type MoveRejectReason = 'given' | 'taken' | 'locked' | 'not-playing' | 'invalid';

export interface Bonus {
  kind: 'row' | 'box';
  /** Row or box number, 0-8. */
  index: number;
}

/** Host -> guests (and to the host's own UI, without the network hop). */
export type ServerMessage =
  | { type: 'welcome'; you: string; state: PublicState }
  | { type: 'join-rejected'; reason: JoinRejectReason }
  | { type: 'state-update'; state: PublicState }
  | { type: 'round-started'; round: number; difficulty: Difficulty }
  | { type: 'cell-solved'; index: number; value: number; by: string; points: number; bonuses: Bonus[] }
  | { type: 'move-rejected'; index: number; reason: MoveRejectReason }
  | { type: 'lockout'; ms: number }
  | { type: 'round-result'; result: RoundResult }
  | { type: 'room-closed' }
  | { type: 'pong' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Validates untrusted data from a guest connection before it reaches the engine. */
export function isClientMessage(data: unknown): data is ClientMessage {
  if (!isObject(data)) return false;
  switch (data.type) {
    case 'join':
      return typeof data.sessionId === 'string' && data.sessionId.length > 0 && data.sessionId.length <= 64
        && typeof data.name === 'string';
    case 'move':
      return isInt(data.index) && isInt(data.value);
    case 'leave':
    case 'ping':
      return true;
    default:
      return false;
  }
}

const SERVER_TYPES = new Set<ServerMessage['type']>([
  'welcome', 'join-rejected', 'state-update', 'round-started', 'cell-solved',
  'move-rejected', 'lockout', 'round-result', 'room-closed', 'pong',
]);

/** Light check on data from the host; the host is trusted, this just guards against garbage. */
export function isServerMessage(data: unknown): data is ServerMessage {
  return isObject(data) && SERVER_TYPES.has(data.type as ServerMessage['type']);
}
