import type { PeerOptions } from 'peerjs';

/**
 * STUN finds each browser's public address, which is enough when at least one
 * side has an open NAT. Peers behind strict NATs (mobile data, CGNAT, most
 * corporate and university networks) can only reach each other through a TURN
 * relay, so a TURN server must be configured for play over the internet.
 */
const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** PeerJS's own public relay. Unreliable, so only used when nothing else is configured. */
const PEERJS_TURN: RTCIceServer = {
  urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
  username: 'peerjs',
  credential: 'peerjsp',
};

const isIceServerList = (value: unknown): value is RTCIceServer[] =>
  Array.isArray(value) && value.every((s) => typeof s === 'object' && s !== null && 'urls' in s);

/** Fetches short-lived TURN credentials from an endpoint returning an `RTCIceServer[]` (see turn-worker/). */
async function fetchTurn(url: string): Promise<RTCIceServer[] | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list: unknown = await res.json();
    if (!isIceServerList(list)) throw new Error('response is not an RTCIceServer list');
    return list;
  } catch (err) {
    console.warn('[net] could not fetch TURN credentials', err);
    return null;
  }
}

let cached: PeerOptions | null = null;

/**
 * Options for every `new Peer(...)`. TURN credentials are fetched from
 * `VITE_TURN_CREDENTIALS_URL` (a build-time setting, not a secret).
 */
export async function peerOptions(): Promise<PeerOptions> {
  if (cached) return cached;
  const credentialsUrl = import.meta.env.VITE_TURN_CREDENTIALS_URL;
  const fetched = credentialsUrl ? await fetchTurn(credentialsUrl) : null;
  const options: PeerOptions = {
    config: { iceServers: [...STUN, ...(fetched?.length ? fetched : [PEERJS_TURN])] },
  };
  // Don't cache a failed fetch, so the next connection attempt tries again.
  if (!credentialsUrl || fetched) cached = options;
  return options;
}
