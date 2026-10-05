import { describe, expect, it } from 'vitest';
import { createRoom, reduce, toPublic } from '../engine/engine';
import type { ServerMessage } from '../net/messages';
import { applyServerMessage, emptyView, type ClientView } from './clientView';

function welcomeView(now = 0): ClientView {
  const room = createRoom({ code: '12345', hostSessionId: 'h', hostName: 'Alice', now });
  const { out } = reduce(room, 'g', { type: 'join', sessionId: 'g', name: 'Bob' }, now);
  const welcome = out.find((o) => o.msg.type === 'welcome')!.msg;
  return applyServerMessage(emptyView, welcome, now);
}

describe('applyServerMessage', () => {
  it('records who I am from the welcome', () => {
    const view = welcomeView();
    expect(view.you).toBe('p2');
    expect(view.state?.players.length).toBe(2);
  });

  it('marks newly solved cells as fresh so they animate once', () => {
    let view = welcomeView();
    view = applyServerMessage(view, { type: 'cell-solved', index: 4, value: 7, by: 'p1', points: 1, bonuses: [] }, 0);
    view = applyServerMessage(view, { type: 'cell-solved', index: 9, value: 2, by: 'p2', points: 1, bonuses: [] }, 0);
    expect(view.state!.cells[4]).toEqual({ value: 7, given: false, owner: 'p1' });
    expect(view.fresh).toEqual({ 4: 1, 9: 2 });
    view = applyServerMessage(view, { type: 'round-started', round: 2, difficulty: 'easy' }, 0);
    expect(view.fresh).toEqual({});
  });

  it('turns lockout durations into a local deadline', () => {
    let view = welcomeView();
    view = applyServerMessage(view, { type: 'lockout', ms: 5000 }, 1_000);
    expect(view.lockoutUntil).toBe(6_000);
  });

  it('restores an active lockout from the state on reconnect', () => {
    const room = createRoom({ code: '12345', hostSessionId: 'h', hostName: 'Alice', now: 0 });
    const state = toPublic(room, 0);
    state.players[0].lockoutMs = 3000;
    const msg: ServerMessage = { type: 'welcome', you: 'p1', state };
    expect(applyServerMessage(emptyView, msg, 10_000).lockoutUntil).toBe(13_000);
  });
});
