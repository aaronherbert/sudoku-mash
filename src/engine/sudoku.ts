import { shuffle, type Rng } from './rng';
import type { Difficulty } from './types';

/** A grid is 81 numbers in row-major order; 0 means empty. */
export type Grid = number[];

export const CLUE_TARGETS: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 26 };

/** How far above the target a puzzle may land if no exact one turns up quickly. */
export const CLUE_TOLERANCE = 2;

const ALL = 0x3fe; // bits 1..9

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** Indices of the 9 cells in a row, column or 3×3 box. */
export function rowCells(r: number): number[] {
  return Array.from({ length: 9 }, (_, c) => r * 9 + c);
}
export function colCells(c: number): number[] {
  return Array.from({ length: 9 }, (_, r) => r * 9 + c);
}
export function boxCells(b: number): number[] {
  const r0 = Math.floor(b / 3) * 3;
  const c0 = (b % 3) * 3;
  return Array.from({ length: 9 }, (_, k) => (r0 + Math.floor(k / 3)) * 9 + c0 + (k % 3));
}

function bitCount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

interface Masks {
  rows: number[];
  cols: number[];
  boxes: number[];
}

/** Returns null if the grid already breaks a Sudoku rule. */
function buildMasks(grid: Grid): Masks | null {
  const m: Masks = { rows: Array(9).fill(0), cols: Array(9).fill(0), boxes: Array(9).fill(0) };
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    const r = rowOf(i), c = colOf(i), b = boxOf(i);
    if ((m.rows[r] | m.cols[c] | m.boxes[b]) & bit) return null;
    m.rows[r] |= bit;
    m.cols[c] |= bit;
    m.boxes[b] |= bit;
  }
  return m;
}

/**
 * Backtracking search that always branches on the most constrained empty cell.
 * Calls `onSolution` for each solution; return true from it to stop early.
 */
function search(grid: Grid, m: Masks, order: (cands: number) => number[], onSolution: () => boolean): boolean {
  let best = -1;
  let bestCands = 0;
  let bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    const cands = ALL & ~(m.rows[rowOf(i)] | m.cols[colOf(i)] | m.boxes[boxOf(i)]);
    const n = bitCount(cands);
    if (n === 0) return false;
    if (n < bestCount) {
      best = i;
      bestCands = cands;
      bestCount = n;
      if (n === 1) break;
    }
  }
  if (best === -1) return onSolution();

  const r = rowOf(best), c = colOf(best), b = boxOf(best);
  for (const v of order(bestCands)) {
    const bit = 1 << v;
    grid[best] = v;
    m.rows[r] |= bit;
    m.cols[c] |= bit;
    m.boxes[b] |= bit;
    const stop = search(grid, m, order, onSolution);
    m.rows[r] &= ~bit;
    m.cols[c] &= ~bit;
    m.boxes[b] &= ~bit;
    grid[best] = 0;
    if (stop) return true;
  }
  return false;
}

function digitsOf(cands: number): number[] {
  const out: number[] = [];
  for (let v = 1; v <= 9; v++) if (cands & (1 << v)) out.push(v);
  return out;
}

/** Counts solutions, stopping once `limit` is reached (2 is enough to test uniqueness). */
export function countSolutions(grid: Grid, limit = 2): number {
  const work = grid.slice();
  const m = buildMasks(work);
  if (!m) return 0;
  let count = 0;
  search(work, m, digitsOf, () => ++count >= limit);
  return count;
}

/** Solves the grid, or returns null if it has no solution. */
export function solve(grid: Grid): Grid | null {
  const work = grid.slice();
  const m = buildMasks(work);
  if (!m) return null;
  let result: Grid | null = null;
  search(work, m, digitsOf, () => {
    result = work.slice();
    return true;
  });
  return result;
}

/** A random, complete, valid Sudoku grid. */
export function generateSolved(rng: Rng): Grid {
  const work: Grid = Array(81).fill(0);
  const m = buildMasks(work)!;
  let result: Grid | null = null;
  search(work, m, (cands) => shuffle(digitsOf(cands), rng), () => {
    result = work.slice();
    return true;
  });
  return result!;
}

export interface Puzzle {
  puzzle: Grid;
  solution: Grid;
  clues: number;
}

/**
 * Makes a puzzle with exactly one solution and about CLUE_TARGETS[difficulty] givens.
 * Removes cells in random order, putting back any removal that allows a second solution.
 */
export function generatePuzzle(difficulty: Difficulty, rng: Rng, maxAttempts = 25): Puzzle {
  const target = CLUE_TARGETS[difficulty];
  let best: Puzzle | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolved(rng);
    const puzzle = solution.slice();
    let clues = 81;
    for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k), rng)) {
      if (clues <= target) break;
      const v = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle, 2) === 1) clues--;
      else puzzle[i] = v;
    }
    if (!best || clues < best.clues) best = { puzzle, solution, clues };
    if (clues <= target + CLUE_TOLERANCE) break;
  }
  return best!;
}
