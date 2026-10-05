import { describe, expect, it } from 'vitest';
import { isClientMessage } from './messages';
import { isRoomCode, peerIdFor, randomCode } from './peerIds';

describe('isClientMessage', () => {
  it('accepts well-formed guest messages', () => {
    expect(isClientMessage({ type: 'join', sessionId: 'abc', name: 'Bob' })).toBe(true);
    expect(isClientMessage({ type: 'move', index: 3, value: 7 })).toBe(true);
    expect(isClientMessage({ type: 'ping' })).toBe(true);
  });

  it('rejects host-only and engine-internal inputs from the network', () => {
    for (const type of ['begin-round', 'set-difficulty', 'end-game', 'start-round', 'disconnect']) {
      expect(isClientMessage({ type, puzzle: [], solution: [], difficulty: 'easy' })).toBe(false);
    }
  });

  it('rejects malformed data', () => {
    expect(isClientMessage(null)).toBe(false);
    expect(isClientMessage('move')).toBe(false);
    expect(isClientMessage({ type: 'move', index: '3', value: 7 })).toBe(false);
    expect(isClientMessage({ type: 'join', sessionId: '', name: 'Bob' })).toBe(false);
  });
});

describe('room codes', () => {
  it('are five digits from 10000 to 99999', () => {
    expect(randomCode(() => 0)).toBe('10000');
    expect(randomCode(() => 0.999999)).toBe('99999');
    for (let i = 0; i < 100; i++) expect(isRoomCode(randomCode())).toBe(true);
    expect(isRoomCode('01234')).toBe(false);
    expect(peerIdFor('12345')).toBe('sudoku-mash-12345');
  });
});
