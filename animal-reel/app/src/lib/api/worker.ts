import { getSettings } from '../config';
import { AppError } from '../../types';

function baseUrl(): string {
  const url = getSettings().workerUrl;
  if (!url) {
    throw new AppError(
      'no_worker',
      'No Worker URL set.',
      'Open Settings and paste the URL of your Cloudflare Worker. It holds the API keys so the app never has to.',
    );
  }
  return url;
}

function headers(extra: Record<string, string> = {}) {
  const { appToken } = getSettings();
  return { ...(appToken ? { 'X-App-Token': appToken } : {}), ...extra };
}

async function handle(res: Response): Promise<any> {
  if (res.ok) return res.json();
  let code = `http_${res.status}`;
  let message = `The Worker returned ${res.status}.`;
  let retryAfter: number | undefined;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code || code;
      message = body.error.message || message;
      retryAfter = body.error.retryAfterSeconds;
    }
  } catch {
    /* non-JSON error body */
  }
  throw new AppError(code, message, hintFor(code), retryAfter);
}

function hintFor(code: string): string | undefined {
  switch (code) {
    case 'gemini_quota':
      return 'The Gemini free tier resets daily. Switch the script model to Flash-Lite in Settings to keep going today.';
    case 'pexels_rate_limit':
      return 'Pexels allows 200 searches an hour. Turn on "Prefer Wikimedia Commons" in Settings to keep working.';
    case 'no_gemini_key':
    case 'no_pexels_key':
    case 'no_pixabay_key':
      return 'Set the key on the Worker with: wrangler secret put <NAME>';
    case 'bad_token':
      return 'Paste the same value you gave the Worker as APP_TOKEN.';
    default:
      return undefined;
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function workerHealth() {
  const res = await fetch(`${baseUrl()}/api/health`, { headers: headers() });
  return handle(res) as Promise<{
    ok: boolean;
    has: { gemini: boolean; pexels: boolean; pixabay: boolean; token: boolean };
    models: { flash: string; flashLite: string };
  }>;
}

export function researchCall(body: {
  animal: string;
  mode: string;
  wantFacts: number;
  sourceText: string;
  wikidata: string;
}) {
  return post('/api/research', body) as Promise<{ research: any; model: string }>;
}

export function scriptCall(body: {
  animal: string;
  status: string;
  targetSeconds: number;
  structure: string[];
  tone: string;
  hookStyle: string;
  emoji: boolean;
  research: unknown;
  useFlash: boolean;
}) {
  return post('/api/script', body) as Promise<{ script: any; model: string }>;
}

export function lineCall(body: {
  animal: string;
  line: string;
  role: string;
  tone: string;
  supportingFact: string;
  neighbours: string[];
  instruction: string;
}) {
  return post('/api/line', body) as Promise<{ line: { text: string; visualQuery: string; emoji: string }; model: string }>;
}

export async function styleCall(files: File[], notes: string) {
  const form = new FormData();
  form.append('notes', notes);
  for (const f of files) form.append('media', f, f.name);
  const res = await fetch(`${baseUrl()}/api/style`, { method: 'POST', headers: headers(), body: form });
  return handle(res) as Promise<{ style: any; model: string }>;
}

export async function imageSearch(q: string, provider: 'pexels' | 'pixabay', perPage = 12, kind: 'photo' | 'video' = 'photo') {
  const url = `${baseUrl()}/api/images?q=${encodeURIComponent(q)}&provider=${provider}&per_page=${perPage}&kind=${kind}`;
  const res = await fetch(url, { headers: headers() });
  return handle(res) as Promise<{ assets: any[]; provider: string }>;
}

/**
 * Wraps a remote media URL in the Worker proxy. Canvas pixel reads need a
 * same-policy response with CORS headers, which the proxy guarantees.
 */
export function proxied(url: string): string {
  const base = getSettings().workerUrl;
  if (!base) return url;
  return `${base}/api/proxy?url=${encodeURIComponent(url)}`;
}
