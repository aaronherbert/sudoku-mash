/**
 * Hands browsers short-lived TURN credentials from Cloudflare's TURN service.
 * The long-lived API token stays here as a Worker secret; the browser only
 * ever sees credentials that expire after `TTL_SECONDS`.
 */

interface Env {
  /** Cloudflare TURN key id (Dashboard → Realtime → TURN Server). */
  TURN_KEY_ID: string;
  /** That TURN key's API token. Set with `wrangler secret put TURN_KEY_API_TOKEN`. */
  TURN_KEY_API_TOKEN: string;
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

    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );
    if (!res.ok) return new Response('TURN credentials unavailable', { status: 502, headers: cors });

    const { iceServers } = (await res.json()) as { iceServers: unknown };
    return Response.json(iceServers, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  },
};
