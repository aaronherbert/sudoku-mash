import type { Difficulty } from '../engine/types';
import type { ServerMessage } from '../net/messages';
import type { ClientView } from './clientView';

export type RoomStatus = 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed';

/** Why a room ended for this player. */
export type EndReason = 'host-left' | 'closed-by-me' | 'left' | 'full';

export type ServerListener = (msg: ServerMessage) => void;

/** What the UI uses to play, whether this browser is the host or a guest. */
export interface RoomHandle {
  role: 'host' | 'guest';
  status: RoomStatus;
  endReason: EndReason | null;
  /** Set when status is 'failed'. */
  error: string | null;
  view: ClientView;
  move: (index: number, value: number) => void;
  /** Host only. */
  setDifficulty: (difficulty: Difficulty) => void;
  /** Host only: generate a puzzle and start the next round. */
  beginRound: () => void;
  /** Host: close the room for everyone. Guest: leave it. */
  leave: () => void;
  /** Every message this player receives, for toasts and announcements. */
  subscribe: (listener: ServerListener) => () => void;
  /** Dev builds only (host): solve all but 3 cells, to reach the results quickly. */
  devFill?: () => void;
}
