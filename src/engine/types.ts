export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export type Phase = 'lobby' | 'generating' | 'playing' | 'results' | 'closed';

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;
export const LOCKOUT_MS = 5000;
export const MAX_NAME_LENGTH = 20;

export const POINTS_PER_CELL = 1;
export const POINTS_PER_ROW = 5;
export const POINTS_PER_BOX = 5;

/**
 * Tide palettes used as player colours, all at the same shade. The first six are
 * clearly different hues; blue and amber sit close to cobalt and saffron, so
 * they're only handed out once those six are taken.
 */
export const PLAYER_COLORS = ['cobalt', 'saffron', 'red', 'green', 'cobalt-alt', 'mist', 'blue', 'amber'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];
export const DISTINCT_PLAYER_COLORS = 6;

export interface Cell {
  /** 0 while empty. */
  value: number;
  given: boolean;
  /** Public id of the player who solved it; null for givens and empty cells. */
  owner: string | null;
}

export interface Player {
  /** Secret kept in the player's localStorage; proves who is reconnecting. Never broadcast. */
  sessionId: string;
  /** Public id ("p1", "p2"…) shown to everyone and used as a cell's owner. */
  id: string;
  /** 1-based seat number, used as the player's marker on the board. */
  seat: number;
  /** Picked at random on joining, unique in the room. Their solved cells show in it. */
  color: PlayerColor;
  name: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
  roundScore: number;
  totalScore: number;
  cellsSolved: number;
  /** Host clock time when this player's round score last went up; breaks ties in placings. */
  lastScoreAt: number;
  /** Host clock time until which this player's moves are ignored. */
  lockedUntil: number;
}

export interface Placing {
  place: number;
  playerId: string;
  name: string;
  roundScore: number;
  cellsSolved: number;
}

export interface Standing {
  place: number;
  playerId: string;
  name: string;
  totalScore: number;
}

export interface RoundResult {
  round: number;
  difficulty: Difficulty;
  placings: Placing[];
  totals: Standing[];
}

/** Full host-side room state. Contains the solution, so it never leaves the host. */
export interface RoomState {
  code: string;
  phase: Phase;
  difficulty: Difficulty;
  round: number;
  cells: Cell[];
  solution: number[];
  players: Player[];
  nextSeat: number;
  lastResult: RoundResult | null;
}

export interface PublicPlayer {
  id: string;
  seat: number;
  color: PlayerColor;
  name: string;
  isHost: boolean;
  connected: boolean;
  roundScore: number;
  totalScore: number;
  cellsSolved: number;
  /** Lockout time left, in ms, when this state was sent. 0 when not locked out. */
  lockoutMs: number;
}

/** What guests see: no solution, no session ids. */
export interface PublicState {
  code: string;
  phase: Phase;
  difficulty: Difficulty;
  round: number;
  cells: Cell[];
  players: PublicPlayer[];
  lastResult: RoundResult | null;
}
