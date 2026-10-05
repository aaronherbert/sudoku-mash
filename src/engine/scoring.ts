import type { Bonus } from '../net/messages';
import { boxCells, boxOf, rowCells, rowOf } from './sudoku';
import {
  POINTS_PER_BOX,
  POINTS_PER_CELL,
  POINTS_PER_ROW,
  type Cell,
  type Placing,
  type Player,
  type Standing,
} from './types';

/** Bonuses earned by filling `index`, given that `cells` already includes the new value. */
export function completionBonuses(cells: readonly Cell[], index: number): Bonus[] {
  const bonuses: Bonus[] = [];
  const full = (indices: number[]) => indices.every((i) => cells[i].value !== 0);
  if (full(rowCells(rowOf(index)))) bonuses.push({ kind: 'row', index: rowOf(index) });
  if (full(boxCells(boxOf(index)))) bonuses.push({ kind: 'box', index: boxOf(index) });
  return bonuses;
}

export function pointsFor(bonuses: readonly Bonus[]): number {
  return bonuses.reduce((sum, b) => sum + (b.kind === 'row' ? POINTS_PER_ROW : POINTS_PER_BOX), POINTS_PER_CELL);
}

/**
 * Round placings: highest round score first. On a tie, whoever reached that score
 * first places higher; then whoever joined first.
 */
export function rankRound(players: readonly Player[]): Placing[] {
  return players
    .slice()
    .sort((a, b) =>
      b.roundScore - a.roundScore
      || tieTime(a) - tieTime(b)
      || a.joinedAt - b.joinedAt)
    .map((p, i) => ({ place: i + 1, playerId: p.id, name: p.name, roundScore: p.roundScore, cellsSolved: p.cellsSolved }));
}

/** Running scoreboard across rounds. Equal totals share a place. */
export function rankTotals(players: readonly Player[]): Standing[] {
  const sorted = players.slice().sort((a, b) => b.totalScore - a.totalScore || a.joinedAt - b.joinedAt);
  let place = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.totalScore !== sorted[i - 1].totalScore) place = i + 1;
    return { place, playerId: p.id, name: p.name, totalScore: p.totalScore };
  });
}

/** Players who never scored sort after those who did. */
const tieTime = (p: Player) => (p.roundScore > 0 ? p.lastScoreAt : Number.MAX_SAFE_INTEGER);
