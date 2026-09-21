import type { Env } from './env';

const BASE = 'https://generativelanguage.googleapis.com';

export type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }
  | { file_data: { mime_type: string; file_uri: string } };

export interface GeminiCall {
  model: string;
  system?: string;
  parts: Part[];
  schema?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
}

export class GeminiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** Calls generateContent and parses the JSON body the schema asked for. */
export async function geminiJSON<T>(env: Env, call: GeminiCall): Promise<T> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new GeminiError(500, 'no_gemini_key', 'The Worker has no GEMINI_API_KEY set.');

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: call.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: call.temperature ?? 0.7,
      maxOutputTokens: call.maxOutputTokens ?? 8192,
      ...(call.schema ? { responseSchema: call.schema } : {}),
    },
  };
  if (call.system) body.systemInstruction = { parts: [{ text: call.system }] };

  const res = await fetch(`${BASE}/v1beta/models/${call.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      // Free-tier quota. Surface it clearly so the app can tell the user to wait.
      throw new GeminiError(429, 'gemini_quota', `Gemini free-tier limit reached on ${call.model}. ${shortError(text)}`, retryAfterFrom(text));
    }
    throw new GeminiError(res.status, 'gemini_error', `Gemini ${res.status} on ${call.model}: ${shortError(text)}`);
  }

  const data = (await res.json()) as any;
  const cand = data?.candidates?.[0];
  if (!cand) throw new GeminiError(502, 'gemini_empty', 'Gemini returned no candidates.');
  if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    throw new GeminiError(422, 'gemini_blocked', 'Gemini blocked this request.');
  }
  const text = (cand.content?.parts || []).map((p: any) => p.text || '').join('');
  if (!text.trim()) throw new GeminiError(502, 'gemini_empty', 'Gemini returned an empty response.');
  try {
    return JSON.parse(text) as T;
  } catch {
    const salvaged = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    try {
      return JSON.parse(salvaged) as T;
    } catch {
      throw new GeminiError(502, 'gemini_bad_json', 'Gemini did not return valid JSON.');
    }
  }
}

function shortError(text: string): string {
  try {
    const j = JSON.parse(text);
    return String(j?.error?.message || text).slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

function retryAfterFrom(text: string): number | undefined {
  const m = text.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Uploads a media file through the Gemini File API and waits for it to become
 * ACTIVE. Used for reference reels that are too big to inline.
 */
export async function uploadFile(env: Env, bytes: ArrayBuffer, mimeType: string, displayName: string) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new GeminiError(500, 'no_gemini_key', 'The Worker has no GEMINI_API_KEY set.');

  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  const uploadUrl = start.headers.get('X-Goog-Upload-URL');
  if (!start.ok || !uploadUrl) {
    throw new GeminiError(502, 'upload_failed', `Could not start the file upload: ${shortError(await start.text())}`);
  }

  const put = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  });
  if (!put.ok) throw new GeminiError(502, 'upload_failed', `Upload failed: ${shortError(await put.text())}`);
  let file = ((await put.json()) as any).file;

  // Video needs a moment of server-side processing before it can be referenced.
  for (let i = 0; i < 30 && file?.state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${BASE}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': key } });
    if (!poll.ok) break;
    file = await poll.json();
  }
  if (file?.state !== 'ACTIVE') {
    throw new GeminiError(504, 'upload_processing', 'Gemini is still processing that file. Try a shorter clip or upload screenshots instead.');
  }
  return { uri: file.uri as string, mimeType: (file.mimeType as string) || mimeType };
}
