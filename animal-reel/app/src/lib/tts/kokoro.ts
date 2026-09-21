import { getSettings } from '../config';
import { AppError, type ProgressFn } from '../../types';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

type Kokoro = {
  generate(text: string, opts: { voice?: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number }>;
};

let loading: Promise<Kokoro> | null = null;
let loaded: Kokoro | null = null;

export function isModelReady() {
  return !!loaded;
}

/**
 * Loads Kokoro-82M once and keeps it. The weights are a few hundred megabytes
 * on the first run and are then served from the browser cache, so the progress
 * bar only appears once per device.
 */
export async function loadTTS(onProgress?: ProgressFn): Promise<Kokoro> {
  if (loaded) return loaded;
  if (loading) return loading;

  const { ttsDtype } = getSettings();
  const perFile = new Map<string, { loaded: number; total: number }>();

  loading = (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    const tts = (await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: ttsDtype,
      device: 'wasm',
      progress_callback: (p: any) => {
        if (!onProgress) return;
        if (p?.status === 'progress' && p.file) {
          perFile.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
          let done = 0;
          let total = 0;
          for (const v of perFile.values()) {
            done += v.loaded;
            total += v.total;
          }
          onProgress({
            stage: 'Downloading the voice model',
            detail: `${mb(done)} of ${mb(total)} - this only happens once`,
            value: total ? done / total : null,
          });
        } else if (p?.status === 'ready' || p?.status === 'done') {
          onProgress({ stage: 'Voice model ready', value: 1 });
        }
      },
    })) as unknown as Kokoro;
    loaded = tts;
    return tts;
  })().catch(() => {
    // Clear the cached promise so the next attempt retries the download.
    loading = null;
    throw new AppError(
      'tts_load_failed',
      'The voice model would not load.',
      'It is a few hundred megabytes. Check the connection, keep the app in the foreground, and try again.',
    );
  });

  return loading;
}

function mb(bytes: number) {
  return `${(bytes / 1048576).toFixed(0)}MB`;
}

export interface Clip {
  audio: Float32Array;
  sampleRate: number;
  duration: number;
}

/** Renders one line of the script. */
export async function speak(text: string, voice: string, speed: number, onProgress?: ProgressFn): Promise<Clip> {
  const tts = await loadTTS(onProgress);
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { audio: new Float32Array(0), sampleRate: 24000, duration: 0 };

  const raw = await tts.generate(clean, { voice, speed });
  const audio = raw.audio instanceof Float32Array ? raw.audio : new Float32Array(raw.audio as ArrayLike<number>);
  const sampleRate = raw.sampling_rate || 24000;
  return { audio, sampleRate, duration: audio.length / sampleRate };
}

/** Splits a scene line into sentences, which is the unit Kokoro sounds best on. */
export function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

/** Joins clips end to end, with a short gap so lines do not run together. */
export function concatClips(clips: Clip[], gapSeconds = 0.12): Clip {
  if (!clips.length) return { audio: new Float32Array(0), sampleRate: 24000, duration: 0 };
  const sampleRate = clips[0].sampleRate;
  const gap = Math.round(gapSeconds * sampleRate);
  const total = clips.reduce((n, c) => n + c.audio.length, 0) + gap * Math.max(0, clips.length - 1);
  const out = new Float32Array(total);
  let at = 0;
  clips.forEach((c, i) => {
    out.set(c.audio, at);
    at += c.audio.length;
    if (i < clips.length - 1) at += gap;
  });
  return { audio: out, sampleRate, duration: out.length / sampleRate };
}

export function clipToWav(clip: Clip): Blob {
  const { audio, sampleRate } = clip;
  const buffer = new ArrayBuffer(44 + audio.length * 2);
  const view = new DataView(buffer);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + audio.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, audio.length * 2, true);
  let off = 44;
  for (let i = 0; i < audio.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function wavToClip(blob: Blob, ctx: BaseAudioContext): Promise<Clip> {
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  return { audio: buf.getChannelData(0).slice(), sampleRate: buf.sampleRate, duration: buf.duration };
}
