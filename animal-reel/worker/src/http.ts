import type { Env } from './env';

export function corsHeaders(env: Env, req: Request): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  let allowOrigin = '*';
  if (!allowed.includes('*')) {
    allowOrigin = allowed.includes(origin) ? origin : allowed[0] || '';
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(env: Env, req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env, req), ...extra },
  });
}

/** Shape every failure the same way so the PWA can show a useful message. */
export function fail(env: Env, req: Request, status: number, code: string, message: string, retryAfterSeconds?: number) {
  const extra: Record<string, string> = {};
  if (retryAfterSeconds) extra['Retry-After'] = String(retryAfterSeconds);
  return json(env, req, { error: { code, message, retryAfterSeconds } }, status, extra);
}

export function checkToken(env: Env, req: Request): boolean {
  if (!env.APP_TOKEN) return true; // no token configured -> open (fine for personal use)
  return req.headers.get('X-App-Token') === env.APP_TOKEN;
}
