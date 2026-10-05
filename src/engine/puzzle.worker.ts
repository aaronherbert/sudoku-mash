/// <reference lib="webworker" />
import { generatePuzzle } from './sudoku';
import type { Difficulty } from './types';

export interface PuzzleRequest {
  id: number;
  difficulty: Difficulty;
}

self.onmessage = (event: MessageEvent<PuzzleRequest>) => {
  const { id, difficulty } = event.data;
  const { puzzle, solution } = generatePuzzle(difficulty, Math.random);
  self.postMessage({ id, puzzle, solution });
};
