import type { CaptionWord } from '../../types';
import type { Clip } from '../tts/kokoro';

/**
 * Finds where speech actually starts and ends inside a clip. Kokoro pads its
 * output with a little silence, and trimming it before spreading word times
 * keeps captions from drifting ahead of the voice.
 */
export function speechBounds(clip: Clip, threshold = 0.012): { start: number; end: number } {
  const a = clip.audio;
  const win = Math.max(1, Math.round(clip.sampleRate * 0.01));
  let first = 0;
  let last = a.length;

  for (let i = 0; i < a.length; i += win) {
    if (rms(a, i, win) > threshold) {
      first = i;
      break;
    }
  }
  for (let i = a.length - win; i >= 0; i -= win) {
    if (rms(a, i, win) > threshold) {
      last = Math.min(a.length, i + win);
      break;
    }
  }
  if (last <= first) return { start: 0, end: clip.duration };
  return { start: first / clip.sampleRate, end: last / clip.sampleRate };
}

function rms(a: Float32Array, from: number, len: number): number {
  let sum = 0;
  const end = Math.min(a.length, from + len);
  for (let i = from; i < end; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / Math.max(1, end - from));
}

/**
 * Spreads a sentence's spoken duration across its words by how long each word
 * takes to say. Character count is the base, with extra weight for the pause a
 * comma or full stop introduces.
 */
export function timeSentence(text: string, startAt: number, speechStart: number, speechEnd: number): CaptionWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const weights = words.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.15, speechEnd - speechStart);

  const out: CaptionWord[] = [];
  let at = startAt + speechStart;
  words.forEach((word, i) => {
    const dur = (weights[i] / total) * span;
    out.push({ word, start: at, end: at + dur });
    at += dur;
  });
  return out;
}

function weightOf(word: string): number {
  // Letters carry the syllables; a trailing mark buys a beat of silence.
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  let w = Math.max(1.6, letters + 1.2);
  if (/[,;:]$/.test(word)) w += 2.2;
  if (/[.!?]$/.test(word)) w += 3.4;
  if (/[-–—]$/.test(word)) w += 1.4;
  return w;
}

export interface CaptionChunk {
  words: CaptionWord[];
  start: number;
  end: number;
}

/** Groups timed words into the 1-4 word chunks the style preset asks for. */
export function chunkWords(words: CaptionWord[], perChunk: number): CaptionChunk[] {
  const n = Math.max(1, Math.round(perChunk));
  const chunks: CaptionChunk[] = [];
  for (let i = 0; i < words.length; i += n) {
    const group = words.slice(i, i + n);
    if (!group.length) continue;
    chunks.push({ words: group, start: group[0].start, end: group[group.length - 1].end });
  }
  return chunks;
}

/** The chunk on screen at time t, and which of its words is being spoken. */
export function chunkAt(chunks: CaptionChunk[], t: number): { chunk: CaptionChunk; wordIndex: number } | null {
  if (!chunks.length) return null;
  let chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) {
    // Between chunks: hold the one just spoken so captions do not flicker off.
    const prev = [...chunks].reverse().find((c) => c.end <= t);
    if (prev && t - prev.end < 0.35) chunk = prev;
    else if (t < chunks[0].start) chunk = chunks[0];
  }
  if (!chunk) return null;
  let wordIndex = chunk.words.findIndex((w) => t >= w.start && t < w.end);
  if (wordIndex < 0) wordIndex = t >= chunk.end ? chunk.words.length - 1 : 0;
  return { chunk, wordIndex };
}

/** Rebuilds word timings after the user edits a line, keeping the same span. */
export function retimeText(text: string, start: number, end: number): CaptionWord[] {
  return timeSentence(text, start, 0, Math.max(0.2, end - start));
}
