import { type Env, flashLiteModel, flashModel } from './env';
import { checkToken, corsHeaders, fail, json } from './http';
import { GeminiError, geminiJSON, type Part, uploadFile } from './gemini';
import { proxyAllows, ProviderError, searchPexels, searchPixabay } from './images';
import {
  LINE_SYSTEM,
  RESEARCH_SYSTEM,
  SCRIPT_SYSTEM,
  STYLE_SYSTEM,
  linePrompt,
  researchPrompt,
  scriptPrompt,
  stylePrompt,
} from './prompts';
import { lineSchema, researchSchema, scriptSchema, styleSchema } from './schemas';

/** Gemini inlines media up to ~20MB; bigger files go through the File API. */
const INLINE_LIMIT = 15 * 1024 * 1024;
const MAX_UPLOAD = 90 * 1024 * 1024;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    }

    if (url.pathname === '/api/health') {
      return json(env, req, {
        ok: true,
        has: {
          gemini: !!env.GEMINI_API_KEY,
          pexels: !!env.PEXELS_API_KEY,
          pixabay: !!env.PIXABAY_API_KEY,
          token: !!env.APP_TOKEN,
        },
        models: { flash: flashModel(env), flashLite: flashLiteModel(env) },
      });
    }

    // The image proxy is used by <img crossorigin> so it cannot send a token header.
    if (url.pathname === '/api/proxy') return handleProxy(req, env, ctx);

    if (!checkToken(env, req)) {
      return fail(env, req, 401, 'bad_token', 'This Worker needs the app token. Set it in Settings.');
    }

    try {
      switch (url.pathname) {
        case '/api/research':
          return await handleResearch(req, env);
        case '/api/script':
          return await handleScript(req, env);
        case '/api/style':
          return await handleStyle(req, env);
        case '/api/line':
          return await handleLine(req, env);
        case '/api/images':
          return await handleImages(req, env, url);
        default:
          return fail(env, req, 404, 'not_found', `No route for ${url.pathname}.`);
      }
    } catch (err) {
      if (err instanceof GeminiError || err instanceof ProviderError) {
        return fail(env, req, err.status, err.code, err.message, err.retryAfterSeconds);
      }
      return fail(env, req, 500, 'worker_error', err instanceof Error ? err.message : 'Unknown Worker error.');
    }
  },
};

async function handleResearch(req: Request, env: Env) {
  const body = (await req.json()) as {
    animal?: string;
    mode?: 'alive' | 'extinct' | 'auto';
    wantFacts?: number;
    sourceText?: string;
    wikidata?: string;
  };
  if (!body.animal || !body.sourceText) {
    return fail(env, req, 400, 'bad_request', 'animal and sourceText are required.');
  }

  const result = await geminiJSON(env, {
    // Research is the bulk call, so it runs on the higher-quota Flash-Lite model.
    model: flashLiteModel(env),
    system: RESEARCH_SYSTEM,
    temperature: 0.4,
    schema: researchSchema,
    parts: [
      {
        text: researchPrompt({
          animal: body.animal,
          mode: body.mode || 'auto',
          wantFacts: clamp(body.wantFacts ?? 8, 5, 8),
          // Keep the prompt inside a sane token budget.
          sourceText: (body.sourceText || '').slice(0, 60000),
          wikidata: (body.wikidata || '').slice(0, 4000),
        }),
      },
    ],
  });

  return json(env, req, { research: result, model: flashLiteModel(env) });
}

async function handleScript(req: Request, env: Env) {
  const body = (await req.json()) as {
    animal?: string;
    status?: string;
    targetSeconds?: number;
    structure?: string[];
    tone?: string;
    hookStyle?: string;
    emoji?: boolean;
    research?: unknown;
    useFlash?: boolean;
  };
  if (!body.animal || !body.research) {
    return fail(env, req, 400, 'bad_request', 'animal and research are required.');
  }

  // The script is the one call worth spending the small Flash quota on, but the app
  // can fall back to Flash-Lite when that quota is gone.
  const model = body.useFlash === false ? flashLiteModel(env) : flashModel(env);

  const result = await geminiJSON(env, {
    model,
    system: SCRIPT_SYSTEM,
    temperature: 0.85,
    schema: scriptSchema,
    parts: [
      {
        text: scriptPrompt({
          animal: body.animal,
          status: body.status || 'unknown',
          targetSeconds: clamp(body.targetSeconds ?? 35, 10, 90),
          structure: body.structure?.length ? body.structure : ['hook', 'fact', 'fact', 'fact', 'cta'],
          tone: body.tone || 'clear and punchy',
          hookStyle: body.hookStyle || 'shocking-fact',
          emoji: !!body.emoji,
          research: body.research,
        }),
      },
    ],
  });

  return json(env, req, { script: result, model });
}

async function handleLine(req: Request, env: Env) {
  const body = (await req.json()) as {
    animal?: string;
    line?: string;
    role?: string;
    tone?: string;
    supportingFact?: string;
    neighbours?: string[];
    instruction?: string;
  };
  if (!body.line) return fail(env, req, 400, 'bad_request', 'line is required.');

  // A one-line rewrite is cheap, so it always runs on the high-quota model.
  const result = await geminiJSON(env, {
    model: flashLiteModel(env),
    system: LINE_SYSTEM,
    temperature: 1.0,
    schema: lineSchema,
    parts: [
      {
        text: linePrompt({
          animal: body.animal || '',
          line: body.line,
          role: body.role || 'fact',
          tone: body.tone || 'clear and punchy',
          supportingFact: body.supportingFact || '',
          neighbours: body.neighbours || [],
          instruction: body.instruction || '',
        }),
      },
    ],
  });

  return json(env, req, { line: result, model: flashLiteModel(env) });
}

async function handleStyle(req: Request, env: Env) {
  const form = await req.formData();
  const notes = String(form.get('notes') || '');
  // The Workers FormData type widens entries to string, so narrow structurally.
  const entries = form.getAll('media') as unknown as Array<File | string>;
  const files = entries.filter((f): f is File => typeof f !== 'string' && typeof (f as File).arrayBuffer === 'function');
  if (!files.length) return fail(env, req, 400, 'bad_request', 'Attach at least one image or video as "media".');

  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_UPLOAD) {
    return fail(env, req, 413, 'too_big', 'That reference is over 90MB. Trim the clip or upload screenshots instead.');
  }

  const parts: Part[] = [{ text: stylePrompt(notes) }];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const mime = file.type || (file.name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');
    if (bytes.byteLength <= INLINE_LIMIT) {
      parts.push({ inline_data: { mime_type: mime, data: base64(bytes) } });
    } else {
      const up = await uploadFile(env, bytes, mime, file.name || 'reference');
      parts.push({ file_data: { mime_type: up.mimeType, file_uri: up.uri } });
    }
  }

  // Video understanding needs Flash; Flash-Lite does not reliably read frames.
  const result = await geminiJSON(env, {
    model: flashModel(env),
    system: STYLE_SYSTEM,
    temperature: 0.3,
    schema: styleSchema,
    parts,
  });

  return json(env, req, { style: result, model: flashModel(env) });
}

async function handleImages(req: Request, env: Env, url: URL) {
  const query = url.searchParams.get('q') || '';
  if (!query.trim()) return fail(env, req, 400, 'bad_request', 'q is required.');
  const perPage = clamp(Number(url.searchParams.get('per_page') || 12), 3, 30);
  const provider = url.searchParams.get('provider') || 'pexels';
  const kind = url.searchParams.get('kind') === 'video' ? 'video' : 'photo';

  const assets =
    provider === 'pixabay' ? await searchPixabay(env, query, perPage) : await searchPexels(env, query, perPage, kind);

  // Stock search results are stable for a long time; let the edge keep them.
  return json(env, req, { assets, provider }, 200, { 'Cache-Control': 'public, max-age=86400' });
}

async function handleProxy(req: Request, env: Env, ctx: ExecutionContext) {
  const target = proxyAllows(new URL(req.url).searchParams.get('url') || '');
  if (!target) {
    return fail(env, req, 400, 'bad_proxy_url', 'That host is not on the proxy allowlist.');
  }

  const cache = caches.default;
  const cacheKey = new Request(target.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return withCors(hit, env, req);

  const res = await fetch(target.toString(), {
    // Wikimedia asks every client to identify itself.
    headers: { 'User-Agent': 'AnimalReelPWA/0.1 (personal project; contact via GitHub)' },
  });
  if (!res.ok) return fail(env, req, res.status, 'proxy_failed', `Upstream returned ${res.status}.`);

  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'public, max-age=604800');
  out.headers.delete('set-cookie');
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return withCors(out, env, req);
}

function withCors(res: Response, env: Env, req: Request) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(env, req))) out.headers.set(k, v);
  // Canvas rendering needs the pixels to be readable.
  out.headers.set('Timing-Allow-Origin', '*');
  return out;
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}
