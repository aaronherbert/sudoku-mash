import { generatePuzzle } from './sudoku';
import type { Difficulty } from './types';

export interface GeneratedPuzzle {
  puzzle: number[];
  solution: number[];
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (p: GeneratedPuzzle) => void>();
const lastDifficulty = new Map<number, Difficulty>();

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  worker = new Worker(new URL('./puzzle.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<GeneratedPuzzle & { id: number }>) => {
    const { id, puzzle, solution } = event.data;
    pending.get(id)?.({ puzzle, solution });
    pending.delete(id);
  };
  worker.onerror = () => {
    // Fall back to the main thread rather than leaving the round stuck.
    worker?.terminate();
    worker = null;
    for (const [id, resolve] of pending) {
      pending.delete(id);
      resolve(generatePuzzle(lastDifficulty.get(id) ?? 'easy', Math.random));
    }
  };
  return worker;
}

/** Generates a puzzle off the main thread, so the host's UI stays responsive. */
export function requestPuzzle(difficulty: Difficulty): Promise<GeneratedPuzzle> {
  const w = getWorker();
  if (!w) return Promise.resolve(generatePuzzle(difficulty, Math.random));
  const id = nextId++;
  lastDifficulty.set(id, difficulty);
  return new Promise((resolve) => {
    pending.set(id, (p) => {
      lastDifficulty.delete(id);
      resolve(p);
    });
    w.postMessage({ id, difficulty });
  });
}
