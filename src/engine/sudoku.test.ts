import { describe, expect, it } from 'vitest';
import { seededRng } from './rng';
import {
  CLUE_TARGETS,
  CLUE_TOLERANCE,
  boxCells,
  colCells,
  countSolutions,
  generatePuzzle,
  generateSolved,
  rowCells,
  solve,
  type Grid,
} from './sudoku';
import { DIFFICULTIES } from './types';

function isValidSolution(grid: Grid): boolean {
  const groups = [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [rowCells(n), colCells(n), boxCells(n)]);
  return grid.every((v) => v >= 1 && v <= 9)
    && groups.every((g) => new Set(g.map((i) => grid[i])).size === 9);
}

describe('solver', () => {
  it('counts 0 solutions for a grid that breaks the rules', () => {
    const grid = Array(81).fill(0);
    grid[0] = 5;
    grid[1] = 5;
    expect(countSolutions(grid)).toBe(0);
  });

  it('finds more than one solution for an almost empty grid', () => {
    expect(countSolutions(Array(81).fill(0), 2)).toBe(2);
  });

  it('solves a known puzzle', () => {
    const puzzle =
      '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
        .split('').map(Number);
    const solution = solve(puzzle)!;
    expect(isValidSolution(solution)).toBe(true);
    expect(solution.join('')).toBe(
      '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
    );
    expect(countSolutions(puzzle)).toBe(1);
  });
});

describe('generateSolved', () => {
  it('makes valid, varied grids', () => {
    const a = generateSolved(seededRng(1));
    const b = generateSolved(seededRng(2));
    expect(isValidSolution(a)).toBe(true);
    expect(isValidSolution(b)).toBe(true);
    expect(a).not.toEqual(b);
  });
});

describe('generatePuzzle', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`makes ${difficulty} puzzles with exactly one solution and ~${CLUE_TARGETS[difficulty]} clues`, () => {
      for (const seed of [11, 22, 33]) {
        const { puzzle, solution, clues } = generatePuzzle(difficulty, seededRng(seed));
        const given = puzzle.filter((v) => v !== 0).length;
        expect(given).toBe(clues);
        expect(clues).toBeGreaterThanOrEqual(CLUE_TARGETS[difficulty]);
        expect(clues).toBeLessThanOrEqual(CLUE_TARGETS[difficulty] + CLUE_TOLERANCE);
        expect(countSolutions(puzzle, 2)).toBe(1);
        expect(isValidSolution(solution)).toBe(true);
        // Givens agree with the solution, and the solver finds that solution.
        expect(puzzle.every((v, i) => v === 0 || v === solution[i])).toBe(true);
        expect(solve(puzzle)).toEqual(solution);
      }
    });
  }

  it('is reproducible from a seed', () => {
    expect(generatePuzzle('medium', seededRng(7))).toEqual(generatePuzzle('medium', seededRng(7)));
  });
});
