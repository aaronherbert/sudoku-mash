import { useEffect, useMemo, useRef, useState } from 'react';
import { GuestConnection, JoinRejectedError, joinRoom, type Joined } from '../net/guestTransport';
import type { ServerMessage } from '../net/messages';
import { backoffMs, sleep } from '../net/peerIds';
import { applyServerMessage, emptyView } from './clientView';
import type { EndReason, RoomHandle, RoomStatus, ServerListener } from './RoomHandle';
import { clearGuest, saveGuest } from './storage';

/** How long a guest keeps trying to reach a host that has gone away. */
export const RECONNECT_WINDOW_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 4000;
const SILENCE_LIMIT_MS = 12_000;

export interface GuestRoomOptions {
  code: string;
  name: string;
  sessionId: string;
  /** A connection that already completed the join handshake (from the home screen). */
  initial?: Joined;
}

/**
 * A guest's view of a room: sends moves to the host and renders whatever the
 * host broadcasts. Reconnects with backoff for up to two minutes if the
 * connection drops (a refresh on either side, or a network blip).
 */
export function useGuestRoom({ code, name, sessionId, initial }: GuestRoomOptions): RoomHandle {
  const [view, setView] = useState(() =>
    initial ? applyServerMessage(emptyView, initial.welcome, Date.now()) : emptyView);
  const [status, setStatus] = useState<RoomStatus>(initial ? 'connected' : 'reconnecting');
  const [endReason, setEndReason] = useState<EndReason | null>(null);

  const connRef = useRef<GuestConnection | null>(null);
  const listenersRef = useRef(new Set<ServerListener>());
  const endedRef = useRef(false);
  const lastHeardRef = useRef(Date.now());

  const end = (reason: EndReason) => {
    if (endedRef.current) return;
    endedRef.current = true;
    connRef.current?.close();
    connRef.current = null;
    clearGuest();
    setEndReason(reason);
    setStatus('ended');
  };

  const handle = (msg: ServerMessage) => {
    lastHeardRef.current = Date.now();
    const now = Date.now();
    setView((v) => applyServerMessage(v, msg, now));
    for (const listener of listenersRef.current) listener(msg);
    if (msg.type === 'room-closed') end('host-left');
  };

  const reconnectingRef = useRef(false);
  const reconnect = async () => {
    if (reconnectingRef.current || endedRef.current) return;
    reconnectingRef.current = true;
    setStatus('reconnecting');
    const deadline = Date.now() + RECONNECT_WINDOW_MS;
    try {
      for (let attempt = 0; !endedRef.current; attempt++) {
        try {
          const joined = await joinRoom(code, sessionId, name);
          if (endedRef.current) {
            joined.conn.close();
            return;
          }
          handle(joined.welcome);
          attach(joined.conn);
          setStatus('connected');
          return;
        } catch (err) {
          if (err instanceof JoinRejectedError) {
            end(err.reason === 'full' ? 'full' : 'host-left');
            return;
          }
        }
        const wait = backoffMs(attempt);
        if (Date.now() + wait > deadline) {
          end('host-left');
          return;
        }
        await sleep(wait);
      }
    } finally {
      reconnectingRef.current = false;
    }
  };

  const attach = (conn: GuestConnection) => {
    connRef.current = conn;
    lastHeardRef.current = Date.now();
    conn.listen({
      onMessage: handle,
      onClose: () => {
        if (connRef.current !== conn) return;
        connRef.current = null;
        void reconnect();
      },
    });
  };

  useEffect(() => {
    endedRef.current = false;
    saveGuest({ code, name });
    if (initial) attach(initial.conn);
    else void reconnect();

    // A host whose tab vanished doesn't always close the data channel promptly,
    // so ping it and treat a long silence as a drop.
    const heartbeat = setInterval(() => {
      const conn = connRef.current;
      if (!conn) return;
      if (Date.now() - lastHeardRef.current > SILENCE_LIMIT_MS) {
        connRef.current = null;
        conn.close();
        void reconnect();
      } else {
        conn.send({ type: 'ping' });
      }
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      endedRef.current = true;
      connRef.current?.close();
      connRef.current = null;
    };
    // One connection lifecycle per mount.
  }, []);

  return useMemo<RoomHandle>(() => ({
    role: 'guest',
    status,
    endReason,
    error: null,
    view,
    move: (index, value) => connRef.current?.send({ type: 'move', index, value }),
    setDifficulty: () => {},
    beginRound: () => {},
    leave: () => {
      connRef.current?.send({ type: 'leave' });
      const conn = connRef.current;
      connRef.current = null;
      setTimeout(() => conn?.close(), 300);
      end('left');
    },
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
  }), [status, endReason, view]);
}
