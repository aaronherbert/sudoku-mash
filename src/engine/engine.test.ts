import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../net/messages';
import { createRoom, pickColor, reduce, toPublic, type EngineInput, type Outbound } from './engine';
import { seededRng } from './rng';
import { generateSolved } from './sudoku';
import { DISTINCT_PLAYER_COLORS, LOCKOUT_MS, MAX_PLAYERS, PLAYER_COLORS, type RoomState } from './types';

const HOST = 'host-session';
const BOB = 'bob-session';
const CAROL = 'carol-session';
const SOLUTION = generateSolved(seededRng(42));
const wrongDigit = (i: number) => (SOLUTION[i] % 9) + 1;

/** Applies inputs in order, collecting every outbound message. */
class Harness {
  out: Outbound[] = [];
  constructor(public state: RoomState, public now = 1_000) {}

  send(from: string, input: EngineInput, advanceMs = 10) {
    this.now += advanceMs;
    const result = reduce(this.state, from, input, this.now);
    this.state = result.state;
    this.out.push(...result.out);
    return result;
  }

  messages<T extends ServerMessage['type']>(type: T, to?: string) {
    return this.out
      .filter((o) => o.msg.type === type && (to === undefined || o.to === to))
      .map((o) => o.msg as Extract<ServerMessage, { type: T }>);
  }

  clear() {
    this.out = [];
  }

  player(sessionId: string) {
    return this.state.players.find((p) => p.sessionId === sessionId)!;
  }
}

function lobby(...guests: [string, string][]) {
  const h = new Harness(createRoom({ code: '12345', hostSessionId: HOST, hostName: 'Alice', now: 1_000 }));
  for (const [sessionId, name] of guests) h.send(sessionId, { type: 'join', sessionId, name });
  return h;
}

/** A started round whose only empty cells are `blanks`. */
function playing(blanks: number[], ...guests: [string, string][]) {
  const h = lobby(...(guests.length ? guests : [[BOB, 'Bob'] as [string, string]]));
  h.send(HOST, { type: 'begin-round' });
  const puzzle = SOLUTION.map((v, i) => (blanks.includes(i) ? 0 : v));
  h.send(HOST, { type: 'start-round', puzzle, solution: SOLUTION });
  h.clear();
  return h;
}

describe('joining', () => {
  it('seats a new player and welcomes them', () => {
    const h = lobby([BOB, '  Bob  ']);
    expect(h.state.players.map((p) => [p.id, p.name, p.isHost])).toEqual([
      ['p1', 'Alice', true],
      ['p2', 'Bob', false],
    ]);
    const [welcome] = h.messages('welcome', BOB);
    expect(welcome.you).toBe('p2');
    expect(h.messages('state-update').length).toBe(1);
  });

  it(`rejects players beyond ${MAX_PLAYERS}`, () => {
    const h = lobby();
    for (let i = 2; i <= MAX_PLAYERS; i++) h.send(`s${i}`, { type: 'join', sessionId: `s${i}`, name: `P${i}` });
    expect(h.state.players.length).toBe(MAX_PLAYERS);
    h.send('late', { type: 'join', sessionId: 'late', name: 'Late' });
    expect(h.state.players.length).toBe(MAX_PLAYERS);
    expect(h.messages('join-rejected', 'late')).toEqual([{ type: 'join-rejected', reason: 'full' }]);
  });

  it('rejects a blank name', () => {
    const h = lobby([BOB, '   ']);
    expect(h.state.players.length).toBe(1);
    expect(h.messages('join-rejected', BOB)[0].reason).toBe('invalid');
  });

  it('frees a lobby seat when a guest leaves', () => {
    const h = lobby([BOB, 'Bob']);
    h.send(BOB, { type: 'leave' });
    expect(h.state.players.length).toBe(1);
  });

  it('never sends session ids or the solution to anyone', () => {
    const h = playing([0, 1, 2]);
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    h.send(BOB, { type: 'join', sessionId: BOB, name: 'Bob' });
    const wire = JSON.stringify(h.out.map((o) => o.msg));
    expect(wire).not.toContain(HOST);
    expect(wire).not.toContain(BOB);
    expect(wire).not.toContain('solution');
    expect(Object.keys(toPublic(h.state, h.now))).not.toContain('solution');
  });
});

describe('host-only actions', () => {
  it('ignores begin-round and set-difficulty from guests', () => {
    const h = lobby([BOB, 'Bob']);
    h.send(BOB, { type: 'begin-round' });
    h.send(BOB, { type: 'set-difficulty', difficulty: 'hard' });
    expect(h.state.phase).toBe('lobby');
    expect(h.state.difficulty).toBe('easy');
  });

  it('needs two connected players to start', () => {
    const h = lobby();
    h.send(HOST, { type: 'begin-round' });
    expect(h.state.phase).toBe('lobby');
    h.send(BOB, { type: 'join', sessionId: BOB, name: 'Bob' });
    h.send(BOB, { type: 'disconnect' });
    h.send(HOST, { type: 'begin-round' });
    expect(h.state.phase).toBe('lobby');
    h.send(BOB, { type: 'join', sessionId: BOB, name: 'Bob' });
    h.send(HOST, { type: 'begin-round' });
    expect(h.state.phase).toBe('generating');
  });

  it('ignores a puzzle from a guest', () => {
    const h = lobby([BOB, 'Bob']);
    h.send(HOST, { type: 'begin-round' });
    h.send(BOB, { type: 'start-round', puzzle: SOLUTION, solution: SOLUTION });
    expect(h.state.phase).toBe('generating');
  });

  it('closes the room on end-game', () => {
    const h = lobby([BOB, 'Bob']);
    h.send(HOST, { type: 'end-game' });
    expect(h.state.phase).toBe('closed');
    expect(h.messages('room-closed').length).toBe(1);
    h.send(CAROL, { type: 'join', sessionId: CAROL, name: 'Carol' });
    expect(h.messages('join-rejected', CAROL)[0].reason).toBe('closed');
  });
});

describe('move validation', () => {
  it('rejects moves before the round starts', () => {
    const h = lobby([BOB, 'Bob']);
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    expect(h.messages('move-rejected', BOB)[0].reason).toBe('not-playing');
  });

  it('rejects moves on given cells without a lockout', () => {
    const h = playing([0]);
    h.send(BOB, { type: 'move', index: 5, value: SOLUTION[5] });
    expect(h.messages('move-rejected', BOB)[0].reason).toBe('given');
    expect(h.player(BOB).lockedUntil).toBe(0);
  });

  it('rejects out-of-range cells and digits', () => {
    const h = playing([0]);
    for (const [index, value] of [[-1, 1], [81, 1], [0, 0], [0, 10], [0.5, 1]]) {
      h.send(BOB, { type: 'move', index, value });
    }
    expect(h.messages('move-rejected', BOB).map((m) => m.reason)).toEqual(Array(5).fill('invalid'));
    expect(h.state.cells[0].value).toBe(0);
  });

  it('ignores moves from unknown sessions', () => {
    const h = playing([0]);
    const before = h.state;
    h.send('stranger', { type: 'move', index: 0, value: SOLUTION[0] });
    expect(h.state).toBe(before);
  });
});

describe('cell-solved events', () => {
  it('broadcasts a correct digit to everyone and credits the player', () => {
    const h = playing([0, 1, 40, 41], [BOB, 'Bob'], [CAROL, 'Carol']);
    h.send(BOB, { type: 'move', index: 40, value: SOLUTION[40] });
    const solved = h.out.filter((o) => o.msg.type === 'cell-solved');
    expect(solved).toEqual([
      { to: 'all', msg: { type: 'cell-solved', index: 40, value: SOLUTION[40], by: 'p2', points: 1, bonuses: [] } },
    ]);
    expect(h.state.cells[40]).toEqual({ value: SOLUTION[40], given: false, owner: 'p2' });
    expect(h.player(BOB).roundScore).toBe(1);
    expect(h.player(BOB).cellsSolved).toBe(1);
    // Everyone's next state-update shows the solved cell.
    const update = h.messages('state-update').at(-1)!;
    expect(update.state.cells[40].owner).toBe('p2');
  });

  it('sends no cell-solved for a wrong digit, and leaves the cell empty', () => {
    const h = playing([0, 1]);
    h.send(BOB, { type: 'move', index: 0, value: wrongDigit(0) });
    expect(h.messages('cell-solved')).toEqual([]);
    expect(h.state.cells[0].value).toBe(0);
  });

  it('gives a cell to whoever gets there first', () => {
    const h = playing([0, 1], [BOB, 'Bob'], [CAROL, 'Carol']);
    h.send(CAROL, { type: 'move', index: 0, value: SOLUTION[0] });
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    expect(h.messages('cell-solved').map((m) => m.by)).toEqual(['p3']);
    expect(h.messages('move-rejected', BOB)[0].reason).toBe('taken');
    expect(h.player(BOB).lockedUntil).toBe(0);
  });
});

describe('lockouts', () => {
  it('locks a player out for 5 seconds after a wrong digit', () => {
    const h = playing([0, 1]);
    h.send(BOB, { type: 'move', index: 0, value: wrongDigit(0) });
    expect(h.messages('lockout', BOB)).toEqual([{ type: 'lockout', ms: LOCKOUT_MS }]);
    expect(h.player(BOB).lockedUntil).toBe(h.now + LOCKOUT_MS);
    expect(h.messages('state-update').at(-1)!.state.players[1].lockoutMs).toBe(LOCKOUT_MS);
  });

  it('ignores even correct moves until the lockout expires', () => {
    const h = playing([0, 1]);
    h.send(BOB, { type: 'move', index: 0, value: wrongDigit(0) });
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] }, LOCKOUT_MS - 1);
    expect(h.messages('move-rejected', BOB).at(-1)!.reason).toBe('locked');
    expect(h.state.cells[0].value).toBe(0);

    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] }, 1);
    expect(h.state.cells[0].owner).toBe('p2');
  });

  it("doesn't affect other players", () => {
    const h = playing([0, 1]);
    h.send(BOB, { type: 'move', index: 0, value: wrongDigit(0) });
    h.send(HOST, { type: 'move', index: 0, value: SOLUTION[0] });
    expect(h.state.cells[0].owner).toBe('p1');
  });

  it('survives a disconnect and reconnect', () => {
    const h = playing([0, 1]);
    h.send(BOB, { type: 'move', index: 1, value: SOLUTION[1] });
    h.send(BOB, { type: 'move', index: 0, value: wrongDigit(0) });
    h.send(BOB, { type: 'disconnect' }, 1000);
    h.clear();
    h.send(BOB, { type: 'join', sessionId: BOB, name: 'Bob' }, 1000);

    const [welcome] = h.messages('welcome', BOB);
    const me = welcome.state.players.find((p) => p.id === welcome.you)!;
    expect(me.id).toBe('p2');
    expect(me.connected).toBe(true);
    expect(me.roundScore).toBe(1);
    expect(me.lockoutMs).toBe(LOCKOUT_MS - 2000);
    expect(welcome.state.cells[1].owner).toBe('p2');

    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    expect(h.messages('move-rejected', BOB).at(-1)!.reason).toBe('locked');
  });
});

describe('scoring', () => {
  it('scores 1 per cell, +5 per completed row and +5 per completed 3x3 box', () => {
    // Cells 0 and 1 share row 0 and box 0; cell 80 is the last cell of row 8 and box 8.
    const h = playing([0, 1, 80]);
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    expect(h.messages('cell-solved').at(-1)!.points).toBe(1);

    h.send(BOB, { type: 'move', index: 1, value: SOLUTION[1] });
    const last = h.messages('cell-solved').at(-1)!;
    expect(last.bonuses).toEqual([{ kind: 'row', index: 0 }, { kind: 'box', index: 0 }]);
    expect(last.points).toBe(11);

    expect(h.player(BOB).roundScore).toBe(12);
  });

  it("doesn't award a column bonus", () => {
    // Once cell 0 is filled, cell 27 is the last gap in column 0, but row 3 and box 3 still need cell 28.
    const h = playing([0, 27, 28]);
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    h.send(BOB, { type: 'move', index: 27, value: SOLUTION[27] });
    expect(h.messages('cell-solved').at(-1)!.points).toBe(1);
  });
});

describe('finishing a round', () => {
  it('ends the round when the grid is full and ranks by round score', () => {
    const h = playing([0, 1, 40, 80], [BOB, 'Bob'], [CAROL, 'Carol']);
    h.send(CAROL, { type: 'move', index: 40, value: SOLUTION[40] }); // Carol 1 + row 4 + box 4 = 11
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] }); // Bob 1
    h.send(BOB, { type: 'move', index: 1, value: SOLUTION[1] }); // Bob 1 + 11 = 12
    expect(h.state.phase).toBe('playing');
    h.send(HOST, { type: 'move', index: 80, value: SOLUTION[80] }); // Alice 11, after Carol

    expect(h.state.phase).toBe('results');
    const [{ result }] = h.messages('round-result');
    expect(result.round).toBe(1);
    expect(result.placings.map((p) => [p.place, p.name, p.roundScore])).toEqual([
      [1, 'Bob', 12],
      [2, 'Carol', 11],
      [3, 'Alice', 11],
    ]);
    // Moves after the round are refused.
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    expect(h.messages('move-rejected', BOB).at(-1)!.reason).toBe('not-playing');
  });

  it('breaks ties by who reached the score first', () => {
    // Each cell is alone in its row and box, so both are worth 11.
    const h = playing([0, 40], [BOB, 'Bob']);
    h.send(BOB, { type: 'move', index: 40, value: SOLUTION[40] });
    h.send(HOST, { type: 'move', index: 0, value: SOLUTION[0] });
    const { placings } = h.state.lastResult!;
    expect(placings[0].roundScore).toBe(placings[1].roundScore);
    expect(placings.map((p) => p.name)).toEqual(['Bob', 'Alice']);
  });

  it('keeps a running total across rounds', () => {
    const h = playing([0], [BOB, 'Bob']);
    h.send(BOB, { type: 'move', index: 0, value: SOLUTION[0] });
    const firstRound = h.player(BOB).totalScore;
    expect(h.state.lastResult!.totals[0]).toMatchObject({ place: 1, name: 'Bob', totalScore: firstRound });

    h.send(HOST, { type: 'set-difficulty', difficulty: 'hard' });
    h.send(HOST, { type: 'begin-round' });
    h.send(HOST, { type: 'start-round', puzzle: SOLUTION.map((v, i) => (i === 80 ? 0 : v)), solution: SOLUTION });
    expect(h.state.round).toBe(2);
    expect(h.state.difficulty).toBe('hard');
    expect(h.player(BOB).roundScore).toBe(0);

    h.send(HOST, { type: 'move', index: 80, value: SOLUTION[80] });
    const { totals, placings } = h.state.lastResult!;
    expect(placings[0].name).toBe('Alice');
    expect(firstRound).toBe(11);
    expect(totals.map((t) => [t.place, t.name, t.totalScore])).toEqual([
      [1, 'Alice', 11],
      [1, 'Bob', 11],
    ]);
  });
});

describe('player colours', () => {
  it('gives everyone a different Tide palette, distinct hues first', () => {
    const h = lobby();
    for (let i = 2; i <= MAX_PLAYERS; i++) h.send(`s${i}`, { type: 'join', sessionId: `s${i}`, name: `P${i}` });
    const colors = h.state.players.map((p) => p.color);
    expect(new Set(colors).size).toBe(MAX_PLAYERS);
    expect(colors.every((c) => PLAYER_COLORS.includes(c))).toBe(true);
    // The look-alike colours (blue, amber) only go to players 7 and 8.
    const lookAlikes = PLAYER_COLORS.slice(DISTINCT_PLAYER_COLORS);
    expect(colors.slice(0, DISTINCT_PLAYER_COLORS).some((c) => lookAlikes.includes(c))).toBe(false);
  });

  it('picks at random', () => {
    const picks = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => pickColor([], seededRng(seed))));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('keeps a colour through a reconnect and shares it with everyone', () => {
    const h = playing([0, 1]);
    const color = h.player(BOB).color;
    h.send(BOB, { type: 'disconnect' });
    h.send(BOB, { type: 'join', sessionId: BOB, name: 'Bob' });
    expect(h.player(BOB).color).toBe(color);
    expect(h.messages('welcome', BOB)[0].state.players.find((p) => p.id === 'p2')!.color).toBe(color);
  });

  it('only picks colours nobody has', () => {
    const taken = PLAYER_COLORS.slice(0, DISTINCT_PLAYER_COLORS - 1);
    expect(pickColor(taken, Math.random)).toBe(PLAYER_COLORS[DISTINCT_PLAYER_COLORS - 1]);
  });
});
