import Peer, { type DataConnection, type PeerError } from 'peerjs';
import { isClientMessage, type ClientMessage, type ServerMessage } from './messages';
import { peerOptions } from './iceServers';
import { backoffMs, peerIdFor, randomCode, sleep } from './peerIds';

export interface HostTransportHandlers {
  /** A message from a guest. `join` arrives here too, once its connection is mapped. */
  onMessage: (sessionId: string, msg: ClientMessage) => void;
  /** A guest's connection closed. */
  onDisconnect: (sessionId: string) => void;
}

type ErrorType = PeerError<string>['type'];

async function openPeer(id: string): Promise<Peer> {
  const options = await peerOptions();
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, options);
    const onError = (err: PeerError<string>) => {
      peer.off('open', onOpen);
      peer.destroy();
      reject(err);
    };
    const onOpen = () => {
      peer.off('error', onError);
      resolve(peer);
    };
    peer.once('open', onOpen);
    peer.once('error', onError);
  });
}

const errorType = (err: unknown): ErrorType | undefined => (err as { type?: ErrorType } | null)?.type;

/**
 * The host's side of the network: owns the room's Peer, accepts guest
 * connections and maps each one to the session id it joins with.
 */
export class HostTransport {
  private bySession = new Map<string, DataConnection>();
  private handlers: HostTransportHandlers | null = null;
  private closed = false;

  private constructor(readonly code: string, private peer: Peer) {
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => void this.reconnectSignalling());
    peer.on('error', (err) => console.warn('[host] peer error', err.type, err));
  }

  /** Registers a new room, picking a fresh code if PeerJS says one is taken. */
  static async create(maxTries = 5): Promise<HostTransport> {
    let lastError: unknown;
    for (let i = 0; i < maxTries; i++) {
      const code = randomCode();
      try {
        return new HostTransport(code, await openPeer(peerIdFor(code)));
      } catch (err) {
        lastError = err;
        if (errorType(err) !== 'unavailable-id') throw err;
      }
    }
    throw lastError;
  }

  /**
   * Reclaims an existing room's id after a refresh. The signalling server can
   * hold the old id briefly, so keep retrying it for up to `timeoutMs`.
   */
  static async resume(code: string, timeoutMs = 60_000): Promise<HostTransport> {
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; ; attempt++) {
      try {
        return new HostTransport(code, await openPeer(peerIdFor(code)));
      } catch (err) {
        const retryable = errorType(err) === 'unavailable-id' || errorType(err) === 'network'
          || errorType(err) === 'server-error' || errorType(err) === 'socket-error';
        if (!retryable || Date.now() > deadline) throw err;
        await sleep(backoffMs(attempt, 1000, 5000));
      }
    }
  }

  listen(handlers: HostTransportHandlers) {
    this.handlers = handlers;
  }

  send(sessionId: string, msg: ServerMessage) {
    const conn = this.bySession.get(sessionId);
    if (!conn?.open) return;
    conn.send(msg);
    if (msg.type === 'join-rejected') {
      this.bySession.delete(sessionId);
      setTimeout(() => conn.close(), 500);
    }
  }

  broadcast(msg: ServerMessage) {
    for (const conn of this.bySession.values()) if (conn.open) conn.send(msg);
  }

  close() {
    this.closed = true;
    for (const conn of this.bySession.values()) conn.close();
    this.bySession.clear();
    this.peer.destroy();
  }

  private accept(conn: DataConnection) {
    if (!conn.reliable) {
      conn.close();
      return;
    }
    let sessionId: string | null = null;

    conn.on('data', (data) => {
      if (!isClientMessage(data)) return;
      if (data.type === 'join') {
        if (sessionId && sessionId !== data.sessionId) return;
        sessionId = data.sessionId;
        const previous = this.bySession.get(sessionId);
        this.bySession.set(sessionId, conn);
        // A refreshed guest can reconnect before its old connection notices it's dead.
        if (previous && previous !== conn) previous.close();
      }
      if (!sessionId) return;
      this.handlers?.onMessage(sessionId, data);
    });

    conn.on('close', () => {
      if (sessionId && this.bySession.get(sessionId) === conn) {
        this.bySession.delete(sessionId);
        this.handlers?.onDisconnect(sessionId);
      }
    });
    conn.on('error', (err) => console.warn('[host] connection error', err));
  }

  /** Lost the signalling server: existing data connections keep working, but new guests can't reach us. */
  private async reconnectSignalling() {
    for (let attempt = 0; !this.closed && this.peer.disconnected && !this.peer.destroyed; attempt++) {
      await sleep(backoffMs(attempt));
      if (this.closed || this.peer.destroyed) return;
      try {
        this.peer.reconnect();
      } catch {
        // try again after the next backoff
      }
    }
  }
}
