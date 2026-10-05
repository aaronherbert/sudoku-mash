import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoom, hostOf, reduce, type EngineInput } from '../engine/engine';
import { requestPuzzle } from '../engine/puzzleClient';
import type { Difficulty, RoomState } from '../engine/types';
import { HostTransport } from '../net/hostTransport';
import type { ServerMessage } from '../net/messages';
import { applyServerMessage, emptyView } from './clientView';
import type { EndReason, RoomHandle, RoomStatus, ServerListener } from './RoomHandle';
import { clearHost, loadHost, saveHost } from './storage';

export interface HostRoomOptions {
  mode: 'create' | 'resume';
  name: string;
  sessionId: string;
}

/**
 * Runs the room in this browser: owns the engine state, the PeerJS host
 * transport and the puzzle worker. The host's own moves go through the same
 * `reduce` as guests' moves; only the network hop is skipped.
 */
export function useHostRoom({ mode, name, sessionId }: HostRoomOptions): RoomHandle {
  const [view, setView] = useState(emptyView);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<EndReason | null>(null);

  const stateRef = useRef<RoomState | null>(null);
  const hostIdRef = useRef(sessionId);
  const transportRef = useRef<HostTransport | null>(null);
  const listenersRef = useRef(new Set<ServerListener>());

  const deliverLocal = useCallback((msg: ServerMessage) => {
    const now = Date.now();
    setView((v) => applyServerMessage(v, msg, now));
    for (const listener of listenersRef.current) listener(msg);
  }, []);

  // Refs keep these stable, so the transport callbacks never see stale closures.
  const dispatchRef = useRef<(from: string, input: EngineInput) => void>(() => {});
  dispatchRef.current = (from, input) => {
    const prev = stateRef.current;
    if (!prev) return;
    const { state, out } = reduce(prev, from, input, Date.now());
    stateRef.current = state;
    if (state !== prev) {
      if (state.phase === 'closed') clearHost();
      else saveHost({ name, state });
    }
    for (const { to, msg } of out) {
      if (to === 'all') {
        transportRef.current?.broadcast(msg);
        deliverLocal(msg);
      } else if (to === hostIdRef.current) {
        deliverLocal(msg);
      } else {
        transportRef.current?.send(to, msg);
      }
    }
    if (state.phase === 'generating' && prev.phase !== 'generating') generate();
  };
  const dispatch = (from: string, input: EngineInput) => dispatchRef.current(from, input);

  const generate = () => {
    const difficulty = stateRef.current?.difficulty ?? 'easy';
    void requestPuzzle(difficulty).then(({ puzzle, solution }) =>
      dispatch(hostIdRef.current, { type: 'start-round', puzzle, solution }));
  };

  useEffect(() => {
    let cancelled = false;
    let transport: HostTransport | null = null;

    void (async () => {
      try {
        if (mode === 'resume') {
          const saved = loadHost();
          if (!saved) throw new Error('There is no saved game to resume.');
          transport = await HostTransport.resume(saved.state.code);
          if (cancelled) return transport.close();
          stateRef.current = saved.state;
          hostIdRef.current = hostOf(saved.state).sessionId;
        } else {
          transport = await HostTransport.create();
          if (cancelled) return transport.close();
          stateRef.current = createRoom({ code: transport.code, hostSessionId: sessionId, hostName: name, now: Date.now() });
          hostIdRef.current = sessionId;
        }
        transportRef.current = transport;
        transport.listen({
          onMessage: (from, msg) => dispatch(from, msg),
          onDisconnect: (from) => dispatch(from, { type: 'disconnect' }),
        });

        // Guests have to reconnect to a resumed room; until they do, they're away.
        for (const p of stateRef.current.players) {
          if (!p.isHost) dispatch(p.sessionId, { type: 'disconnect' });
        }
        // The host "joins" its own room to get its welcome, without a network hop.
        dispatch(hostIdRef.current, { type: 'join', sessionId: hostIdRef.current, name });
        if (stateRef.current.phase === 'generating') generate();

        setStatus('connected');
      } catch (err) {
        if (cancelled) return;
        console.error('[host] could not open the room', err);
        if (mode === 'resume') clearHost();
        setError(
          mode === 'resume'
            ? "Couldn't reopen your game. It may have expired. Start a new one."
            : "Couldn't create a game. Check your internet connection and try again.",
        );
        setStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
      transport?.close();
      transportRef.current = null;
    };
    // The room is opened once per mount.
  }, []);

  return useMemo<RoomHandle>(() => ({
    role: 'host',
    status,
    endReason,
    error,
    view,
    move: (index, value) => dispatch(hostIdRef.current, { type: 'move', index, value }),
    setDifficulty: (difficulty: Difficulty) => dispatch(hostIdRef.current, { type: 'set-difficulty', difficulty }),
    beginRound: () => dispatch(hostIdRef.current, { type: 'begin-round' }),
    leave: () => {
      dispatch(hostIdRef.current, { type: 'end-game' });
      clearHost();
      const transport = transportRef.current;
      // Give the room-closed message a moment to reach guests.
      setTimeout(() => transport?.close(), 500);
      setEndReason('closed-by-me');
      setStatus('ended');
    },
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
    devFill: import.meta.env.DEV
      ? () => {
          const state = stateRef.current;
          if (state?.phase !== 'playing') return;
          const empty = state.cells.flatMap((c, i) => (c.value === 0 ? [i] : []));
          for (const i of empty.slice(0, -3)) {
            dispatch(hostIdRef.current, { type: 'move', index: i, value: stateRef.current!.solution[i] });
          }
        }
      : undefined,
    // dispatch and generate read refs, so they never go stale.
  }), [status, endReason, error, view]);
}
