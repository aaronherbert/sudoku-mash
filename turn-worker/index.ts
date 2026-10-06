/**
 * Hands browsers short-lived TURN credentials from Metered's TURN service.
 * The account secret key stays here as a Worker secret; the browser only
 * ever sees credentials that expire after `TTL_SECONDS`.
 */

interface Env {
  /** Metered app name: the `<appname>` in `<appname>.metered.live`. */
  METERED_APP_NAME: string;
  /** Metered secret key (Dashboard → Developers). Set with `wrangler secret put METERED_SECRET_KEY`. */
  METERED_SECRET_KEY: string;
  /** Comma-separated origins allowed to ask, e.g. `https://aaronherbert.github.io,http://localhost:5173`. */
  ALLOWED_ORIGINS: string;
}

const TTL_SECONDS = 4 * 60 * 60;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 });

    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const api = `https://${env.METERED_APP_NAME}.metered.live/api/v1/turn`;
    const unavailable = () => new Response('TURN credentials unavailable', { status: 502, headers: cors });

    // Create a credential that expires, then fetch the ICE servers for it. Its
    // apiKey is scoped to that one credential, so it's safe to use here.
    const created = await fetch(`${api}/credential?secretKey=${encodeURIComponent(env.METERED_SECRET_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryInSeconds: TTL_SECONDS, label: 'sudoku-mash' }),
    });
    if (!created.ok) return unavailable();
    const { apiKey } = (await created.json()) as { apiKey: string };

    const servers = await fetch(`${api}/credentials?apiKey=${encodeURIComponent(apiKey)}`);
    if (!servers.ok) return unavailable();
    const iceServers: unknown = await servers.json();

    return Response.json(iceServers, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  },
};
