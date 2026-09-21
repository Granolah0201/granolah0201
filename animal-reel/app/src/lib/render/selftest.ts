import { MIX_SAMPLE_RATE } from '../audio/mix';
import { chunkWords, timeSentence } from '../captions/timing';
import { BUILT_IN_PRESETS } from '../styles/presets';
import { exportReel, type ExportMode } from './export';
import { ReelRenderer } from './renderer';
import type { Project, ProgressFn, Scene } from '../../types';

const LINES = [
  'This animal should not exist.',
  'It regrows its own limbs.',
  'And it never grows up.',
];

/**
 * Builds a tiny reel out of nothing and encodes it, so the export path can be
 * checked on a device before spending any quota on a real one.
 */
export function buildSelfTestProject(): Project {
  const style = BUILT_IN_PRESETS.find((p) => p.id === 'fast-facts')!;
  const scenes: Scene[] = LINES.map((text, i) => {
    const duration = 1.6;
    return {
      id: `selftest-${i}`,
      text,
      role: i === 0 ? 'hook' : 'fact',
      visualQuery: ['self test', 'no network needed', 'encoder check'][i],
      visualKind: 'card',
      factId: '',
      emoji: '',
      duration,
      alternatives: [],
      words: timeSentence(text, 0, 0.05, duration - 0.15),
    };
  });

  const now = Date.now();
  return {
    id: 'selftest',
    animal: 'self test',
    title: 'Export self test',
    mode: 'auto',
    presetId: style.id,
    style: JSON.parse(JSON.stringify(style)),
    voiceId: style.voice.voiceId,
    voiceSpeed: style.voice.speed,
    scenes,
    caption: '',
    hashtags: [],
    musicId: null,
    musicGain: 0.22,
    createdAt: now,
    updatedAt: now,
  };
}

/** A short tone, so the audio track is exercised without loading the voice model. */
export async function buildSelfTestAudio(seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * MIX_SAMPLE_RATE), MIX_SAMPLE_RATE);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, 0);
  gain.gain.setValueAtTime(0.0001, 0);
  gain.gain.exponentialRampToValueAtTime(0.2, 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(0);
  osc.stop(seconds);
  return ctx.startRendering();
}

export interface SelfTestResult {
  mode: ExportMode;
  bytes: number;
  seconds: number;
  frames: number;
  captionChunks: number;
  blob: Blob;
}

export async function runExportSelfTest(onProgress: ProgressFn): Promise<SelfTestResult> {
  const project = buildSelfTestProject();
  const renderer = await ReelRenderer.create(project);
  const audio = await buildSelfTestAudio(renderer.duration);
  const result = await exportReel(renderer, audio, 'reelwild-self-test', onProgress);

  return {
    mode: result.mode,
    bytes: result.blob.size,
    seconds: result.durationSeconds,
    frames: Math.ceil(renderer.duration * 30),
    captionChunks: project.scenes.reduce(
      (n, s) => n + chunkWords(s.words, project.style.captionStyle.wordsPerChunk).length,
      0,
    ),
    blob: result.blob,
  };
}
