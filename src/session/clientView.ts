import type { PublicState } from '../engine/types';
import type { ServerMessage } from '../net/messages';

/** What a player's UI knows: built only from messages the host sends, host and guests alike. */
export interface ClientView {
  /** My public player id, once welcomed. */
  you: string | null;
  state: PublicState | null;
  /** Local clock time my lockout ends. */
  lockoutUntil: number;
  /** Cells solved since this view started, mapped to a counter, so the UI can animate them. */
  fresh: Record<number, number>;
  seq: number;
  closed: boolean;
}

export const emptyView: ClientView = { you: null, state: null, lockoutUntil: 0, fresh: {}, seq: 0, closed: false };

function myLockout(state: PublicState, you: string | null, now: number): number {
  const ms = state.players.find((p) => p.id === you)?.lockoutMs ?? 0;
  return ms > 0 ? now + ms : 0;
}

export function applyServerMessage(view: ClientView, msg: ServerMessage, now: number): ClientView {
  switch (msg.type) {
    case 'welcome':
      return { ...view, you: msg.you, state: msg.state, lockoutUntil: myLockout(msg.state, msg.you, now), fresh: {} };

    case 'state-update':
      return { ...view, state: msg.state, lockoutUntil: myLockout(msg.state, view.you, now) };

    case 'round-started':
      return { ...view, fresh: {}, lockoutUntil: 0 };

    case 'cell-solved': {
      if (!view.state) return view;
      const cells = view.state.cells.slice();
      cells[msg.index] = { value: msg.value, given: false, owner: msg.by };
      const seq = view.seq + 1;
      return { ...view, seq, state: { ...view.state, cells }, fresh: { ...view.fresh, [msg.index]: seq } };
    }

    case 'lockout':
      return { ...view, lockoutUntil: now + msg.ms };

    case 'round-result':
      return view.state ? { ...view, state: { ...view.state, phase: 'results', lastResult: msg.result } } : view;

    case 'room-closed':
      return { ...view, closed: true };

    case 'join-rejected':
    case 'move-rejected':
    case 'pong':
      return view;
  }
}
