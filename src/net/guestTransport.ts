import Peer, { type DataConnection, type PeerError } from 'peerjs';
import { isServerMessage, type ClientMessage, type JoinRejectReason, type ServerMessage } from './messages';
import { peerIdFor } from './peerIds';

export type ConnectFailure = 'not-found' | 'network' | 'timeout';

export class ConnectError extends Error {
  constructor(readonly kind: ConnectFailure, message: string) {
    super(message);
  }
}

const NETWORK_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'webrtc']);

export interface GuestHandlers {
  onMessage: (msg: ServerMessage) => void;
  /** The connection to the host dropped (not called after `close()`). */
  onClose: () => void;
}

/**
 * One live connection from a guest to the host. Create a new one for each
 * reconnect attempt; each brings its own short-lived Peer so a stale
 * signalling socket never blocks a retry.
 */
export class GuestConnection {
  private closedByUs = false;
  private handlers: GuestHandlers | null = null;
  /** Messages and drops that arrive before anyone is listening, replayed by `listen`. */
  private backlog: ServerMessage[] = [];
  private droppedEarly = false;

  private constructor(private peer: Peer, private conn: DataConnection) {
    conn.on('data', (data) => {
      if (!isServerMessage(data)) return;
      if (this.handlers) this.handlers.onMessage(data);
      else this.backlog.push(data);
    });
    const dropped = () => {
      if (this.closedByUs) return;
      this.closedByUs = true;
      this.peer.destroy();
      if (this.handlers) this.handlers.onClose();
      else this.droppedEarly = true;
    };
    conn.on('close', dropped);
    conn.on('error', dropped);
    peer.on('error', (err) => {
      if (NETWORK_ERRORS.has(err.type)) dropped();
    });
  }

  static connect(code: string, timeoutMs = 10_000): Promise<GuestConnection> {
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      let settled = false;
      const fail = (error: ConnectError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.destroy();
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new ConnectError('timeout', 'Timed out connecting to the host.')),
        timeoutMs,
      );

      peer.once('error', (err: PeerError<string>) => {
        if (err.type === 'peer-unavailable') fail(new ConnectError('not-found', `No game with code ${code}.`));
        else fail(new ConnectError('network', err.message || 'Network error.'));
      });

      peer.once('open', () => {
        const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
        conn.once('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(new GuestConnection(peer, conn));
        });
        conn.once('error', () => fail(new ConnectError('network', 'Connection to the host failed.')));
      });
    });
  }

  listen(handlers: GuestHandlers) {
    this.handlers = handlers;
    const backlog = this.backlog;
    this.backlog = [];
    for (const msg of backlog) handlers.onMessage(msg);
    if (this.droppedEarly) handlers.onClose();
  }

  /** Stops delivering messages until the next `listen` (they're queued meanwhile). */
  unlisten() {
    this.handlers = null;
  }

  send(msg: ClientMessage) {
    if (this.conn.open) this.conn.send(msg);
  }

  close() {
    this.closedByUs = true;
    this.conn.close();
    this.peer.destroy();
  }
}

export class JoinRejectedError extends Error {
  constructor(readonly reason: JoinRejectReason) {
    super(`Join rejected: ${reason}`);
  }
}

export interface Joined {
  conn: GuestConnection;
  welcome: Extract<ServerMessage, { type: 'welcome' }>;
}

/** Connects to a room and completes the join handshake. */
export async function joinRoom(code: string, sessionId: string, name: string, timeoutMs = 10_000): Promise<Joined> {
  const conn = await GuestConnection.connect(code, timeoutMs);
  return new Promise<Joined>((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.close();
      reject(new ConnectError('timeout', 'The host did not answer.'));
    }, timeoutMs);
    conn.listen({
      onMessage: (msg) => {
        if (msg.type === 'welcome') {
          clearTimeout(timer);
          conn.unlisten();
          resolve({ conn, welcome: msg });
        } else if (msg.type === 'join-rejected') {
          clearTimeout(timer);
          conn.close();
          reject(new JoinRejectedError(msg.reason));
        }
      },
      onClose: () => {
        clearTimeout(timer);
        reject(new ConnectError('network', 'The host closed the connection.'));
      },
    });
    conn.send({ type: 'join', sessionId, name });
  });
}
