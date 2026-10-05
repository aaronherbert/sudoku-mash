import type { ClientMessage, HostAction, JoinRejectReason, MoveRejectReason, ServerMessage } from '../net/messages';
import type { Rng } from './rng';
import { completionBonuses, pointsFor, rankRound, rankTotals } from './scoring';
import {
  DIFFICULTIES,
  DISTINCT_PLAYER_COLORS,
  LOCKOUT_MS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  PLAYER_COLORS,
  type Cell,
  type Difficulty,
  type Player,
  type PlayerColor,
  type PublicState,
  type RoomState,
} from './types';

/**
 * Everything the engine reacts to. `start-round` (from the puzzle worker) and
 * `disconnect` (from the transport) are produced by the host's own code and can
 * never arrive from the network, because `isClientMessage` rejects them.
 */
export type EngineInput =
  | ClientMessage
  | HostAction
  | { type: 'start-round'; puzzle: number[]; solution: number[] }
  | { type: 'disconnect' };

/** A message to send, addressed by session id (or to every connected player). */
export interface Outbound {
  to: 'all' | string;
  msg: ServerMessage;
}

export interface ReduceResult {
  state: RoomState;
  out: Outbound[];
}

export interface CreateRoomOptions {
  code: string;
  hostSessionId: string;
  hostName: string;
  difficulty?: Difficulty;
  now: number;
  rng?: Rng;
}

const emptyCells = (): Cell[] => Array.from({ length: 81 }, () => ({ value: 0, given: false, owner: null }));

export function createRoom({ code, hostSessionId, hostName, difficulty = 'easy', now, rng = Math.random }: CreateRoomOptions): RoomState {
  return {
    code,
    phase: 'lobby',
    difficulty,
    round: 0,
    cells: emptyCells(),
    solution: [],
    players: [newPlayer(hostSessionId, hostName, 1, pickColor([], rng), true, now)],
    nextSeat: 2,
    lastResult: null,
  };
}

/**
 * A random colour nobody in the room has. The six clearly distinct hues go
 * first; the two look-alikes (blue, amber) only once those are all taken.
 */
export function pickColor(taken: readonly PlayerColor[], rng: Rng): PlayerColor {
  const free = (colors: readonly PlayerColor[]) => colors.filter((c) => !taken.includes(c));
  const distinct = free(PLAYER_COLORS.slice(0, DISTINCT_PLAYER_COLORS));
  const pool = distinct.length ? distinct : free(PLAYER_COLORS.slice(DISTINCT_PLAYER_COLORS));
  return pool.length ? pool[Math.floor(rng() * pool.length)] : PLAYER_COLORS[0];
}

function newPlayer(sessionId: string, name: string, seat: number, color: PlayerColor, isHost: boolean, now: number): Player {
  return {
    sessionId,
    id: `p${seat}`,
    seat,
    color,
    name,
    isHost,
    connected: true,
    joinedAt: now,
    roundScore: 0,
    totalScore: 0,
    cellsSolved: 0,
    lastScoreAt: 0,
    lockedUntil: 0,
  };
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/** Strips the solution and session ids, and turns lockouts into time remaining. */
export function toPublic(state: RoomState, now: number): PublicState {
  return {
    code: state.code,
    phase: state.phase,
    difficulty: state.difficulty,
    round: state.round,
    cells: state.cells,
    lastResult: state.lastResult,
    players: state.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      color: p.color,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
      roundScore: p.roundScore,
      totalScore: p.totalScore,
      cellsSolved: p.cellsSolved,
      lockoutMs: Math.max(0, p.lockedUntil - now),
    })),
  };
}

export const hostOf = (state: RoomState) => state.players.find((p) => p.isHost)!;
export const connectedCount = (state: RoomState) => state.players.filter((p) => p.connected).length;

/**
 * The host engine. Pure: takes the current state, who sent what, the host's
 * clock and a random source (for player colours), and returns the next state plus the messages to send. Never mutates `prev`.
 */
export function reduce(prev: RoomState, from: string, input: EngineInput, now: number, rng: Rng = Math.random): ReduceResult {
  const state = structuredClone(prev);
  const out: Outbound[] = [];
  const player = state.players.find((p) => p.sessionId === from);
  const broadcastState = () => out.push({ to: 'all', msg: { type: 'state-update', state: toPublic(state, now) } });
  const reply = (msg: ServerMessage) => out.push({ to: from, msg });
  const unchanged = (): ReduceResult => ({ state: prev, out });

  switch (input.type) {
    case 'join': {
      const name = cleanName(input.name);
      const reject = (reason: JoinRejectReason) => {
        reply({ type: 'join-rejected', reason });
        return unchanged();
      };
      if (state.phase === 'closed') return reject('closed');
      if (player) {
        // Reconnect: keep score, board ownership and any active lockout.
        player.connected = true;
        if (name) player.name = name;
      } else {
        if (!name) return reject('invalid');
        if (state.players.length >= MAX_PLAYERS) return reject('full');
        const color = pickColor(state.players.map((p) => p.color), rng);
        state.players.push(newPlayer(from, name, state.nextSeat, color, false, now));
        state.nextSeat++;
      }
      const me = state.players.find((p) => p.sessionId === from)!;
      reply({ type: 'welcome', you: me.id, state: toPublic(state, now) });
      broadcastState();
      return { state, out };
    }

    case 'disconnect': {
      if (!player || !player.connected) return unchanged();
      player.connected = false;
      broadcastState();
      return { state, out };
    }

    case 'leave': {
      if (!player || player.isHost) return unchanged();
      if (state.phase === 'lobby') {
        // Nothing to keep yet, so free the seat.
        state.players = state.players.filter((p) => p !== player);
      } else {
        player.connected = false;
      }
      broadcastState();
      return { state, out };
    }

    case 'ping':
      reply({ type: 'pong' });
      return unchanged();

    case 'move':
      return applyMove(prev, state, player, input.index, input.value, now, out, reply);

    case 'set-difficulty': {
      if (!player?.isHost || !DIFFICULTIES.includes(input.difficulty)) return unchanged();
      if (state.phase !== 'lobby' && state.phase !== 'results') return unchanged();
      state.difficulty = input.difficulty;
      broadcastState();
      return { state, out };
    }

    case 'begin-round': {
      if (!player?.isHost) return unchanged();
      if (state.phase !== 'lobby' && state.phase !== 'results') return unchanged();
      if (connectedCount(state) < MIN_PLAYERS_TO_START) return unchanged();
      state.phase = 'generating';
      broadcastState();
      return { state, out };
    }

    case 'start-round': {
      if (!player?.isHost || state.phase !== 'generating') return unchanged();
      if (input.puzzle.length !== 81 || input.solution.length !== 81) return unchanged();
      state.phase = 'playing';
      state.round++;
      state.solution = input.solution.slice();
      state.cells = input.puzzle.map((v) => ({ value: v, given: v !== 0, owner: null }));
      for (const p of state.players) {
        p.roundScore = 0;
        p.cellsSolved = 0;
        p.lastScoreAt = 0;
        p.lockedUntil = 0;
      }
      out.push({ to: 'all', msg: { type: 'round-started', round: state.round, difficulty: state.difficulty } });
      broadcastState();
      return { state, out };
    }

    case 'end-game': {
      if (!player?.isHost) return unchanged();
      state.phase = 'closed';
      out.push({ to: 'all', msg: { type: 'room-closed' } });
      return { state, out };
    }
  }
}

function applyMove(
  prev: RoomState,
  state: RoomState,
  player: Player | undefined,
  index: number,
  value: number,
  now: number,
  out: Outbound[],
  reply: (msg: ServerMessage) => void,
): ReduceResult {
  const rejected = (reason: MoveRejectReason) => {
    reply({ type: 'move-rejected', index, reason });
    return { state: prev, out };
  };
  if (!player) return { state: prev, out };
  if (state.phase !== 'playing') return rejected('not-playing');
  if (!Number.isInteger(index) || index < 0 || index > 80 || !Number.isInteger(value) || value < 1 || value > 9) {
    return rejected('invalid');
  }
  // Lockouts are enforced here, on the host, whatever the guest's UI shows.
  if (now < player.lockedUntil) return rejected('locked');

  const cell = state.cells[index];
  if (cell.given) return rejected('given');
  if (cell.value !== 0) return rejected('taken');

  if (state.solution[index] !== value) {
    player.lockedUntil = now + LOCKOUT_MS;
    out.push({ to: player.sessionId, msg: { type: 'lockout', ms: LOCKOUT_MS } });
    out.push({ to: 'all', msg: { type: 'state-update', state: toPublic(state, now) } });
    return { state, out };
  }

  cell.value = value;
  cell.owner = player.id;
  const bonuses = completionBonuses(state.cells, index);
  const points = pointsFor(bonuses);
  player.roundScore += points;
  player.totalScore += points;
  player.cellsSolved++;
  player.lastScoreAt = now;
  out.push({ to: 'all', msg: { type: 'cell-solved', index, value, by: player.id, points, bonuses } });

  if (state.cells.every((c) => c.value !== 0)) {
    state.phase = 'results';
    state.lastResult = {
      round: state.round,
      difficulty: state.difficulty,
      placings: rankRound(state.players),
      totals: rankTotals(state.players),
    };
    for (const p of state.players) p.lockedUntil = 0;
    out.push({ to: 'all', msg: { type: 'round-result', result: state.lastResult } });
  }
  out.push({ to: 'all', msg: { type: 'state-update', state: toPublic(state, now) } });
  return { state, out };
}
