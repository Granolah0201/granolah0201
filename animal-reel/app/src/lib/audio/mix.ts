import { renderMusic } from './music';
import type { Clip } from '../tts/kokoro';

export const MIX_SAMPLE_RATE = 48000;

export interface SceneAudio {
  /** Seconds from the start of the reel. */
  start: number;
  clip: Clip;
}

/**
 * Lays the voiceover clips on a timeline and, if music is chosen, ducks the bed
 * under the voice using an envelope taken from the voice itself.
 */
export async function buildMixdown(
  scenes: SceneAudio[],
  totalSeconds: number,
  music: { id: string; gain: number } | null,
): Promise<AudioBuffer> {
  const sampleRate = MIX_SAMPLE_RATE;
  const length = Math.max(1, Math.ceil((totalSeconds + 0.4) * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(ctx.destination);

  for (const s of scenes) {
    if (!s.clip.audio.length) continue;
    const buf = toAudioBuffer(ctx, s.clip, sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(voiceBus);
    src.start(s.start);
  }

  if (music && music.gain > 0) {
    const bed = await renderMusic(music.id, totalSeconds + 1, sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = bed;
    const gain = ctx.createGain();
    applyDucking(ctx, gain.gain, scenes, totalSeconds, music.gain);
    src.connect(gain).connect(ctx.destination);
    src.start(0);
  }

  return ctx.startRendering();
}

/**
 * Drops the music whenever the voice is speaking and lets it back up in the
 * gaps, stepping the gain every 50ms.
 */
function applyDucking(
  ctx: BaseAudioContext,
  param: AudioParam,
  scenes: SceneAudio[],
  totalSeconds: number,
  baseGain: number,
) {
  const step = 0.05;
  const duckTo = baseGain * 0.28;
  const envelope = voiceEnvelope(scenes, totalSeconds, step);

  param.setValueAtTime(baseGain, 0);
  let previous = baseGain;
  for (let i = 0; i < envelope.length; i++) {
    const t = i * step;
    const speaking = envelope[i] > 0.02;
    const target = speaking ? duckTo : baseGain;
    if (Math.abs(target - previous) > 0.001) {
      // Duck fast, recover slowly, the way a radio compressor behaves.
      param.linearRampToValueAtTime(target, t + (speaking ? 0.12 : 0.55));
      previous = target;
    }
  }
  void ctx;
}

function voiceEnvelope(scenes: SceneAudio[], totalSeconds: number, step: number): Float32Array {
  const slots = Math.ceil((totalSeconds + 0.5) / step);
  const env = new Float32Array(slots);
  for (const s of scenes) {
    const { audio, sampleRate } = s.clip;
    const per = Math.max(1, Math.round(step * sampleRate));
    for (let i = 0, slot = Math.floor(s.start / step); i < audio.length; i += per, slot++) {
      if (slot < 0 || slot >= slots) continue;
      let sum = 0;
      const end = Math.min(audio.length, i + per);
      for (let k = i; k < end; k++) sum += audio[k] * audio[k];
      env[slot] = Math.max(env[slot], Math.sqrt(sum / Math.max(1, end - i)));
    }
  }
  return env;
}

export function toAudioBuffer(ctx: BaseAudioContext, clip: Clip, targetRate: number): AudioBuffer {
  if (clip.sampleRate === targetRate) {
    const buf = ctx.createBuffer(1, Math.max(1, clip.audio.length), targetRate);
    // Copy into a fresh view so the type matches whatever backs the source array.
    buf.copyToChannel(new Float32Array(clip.audio), 0);
    return buf;
  }
  // Linear resample is plenty for 24kHz speech going to 48kHz.
  const ratio = targetRate / clip.sampleRate;
  const outLength = Math.max(1, Math.round(clip.audio.length * ratio));
  const buf = ctx.createBuffer(1, outLength, targetRate);
  const out = buf.getChannelData(0);
  for (let i = 0; i < outLength; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(clip.audio.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = clip.audio[i0] * (1 - frac) + clip.audio[i1] * frac;
  }
  return buf;
}

/** Slices a mixdown into chunks the AAC encoder can take one at a time. */
export function sliceBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, seconds: number): AudioBuffer[] {
  const per = Math.max(1, Math.round(seconds * buffer.sampleRate));
  const out: AudioBuffer[] = [];
  for (let start = 0; start < buffer.length; start += per) {
    const len = Math.min(per, buffer.length - start);
    const chunk = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      chunk.copyToChannel(new Float32Array(buffer.getChannelData(ch).subarray(start, start + len)), ch);
    }
    out.push(chunk);
  }
  return out;
}

export function bufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const length = buffer.length * channels * 2;
  const ab = new ArrayBuffer(44 + length);
  const view = new DataView(ab);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, length, true);

  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < channels; ch++, off += 2) {
      const s = Math.max(-1, Math.min(1, data[ch][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
