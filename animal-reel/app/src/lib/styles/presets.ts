import type { StyleProfile } from '../../types';

const base = {
  builtIn: true as const,
  createdAt: 0,
};

export const BUILT_IN_PRESETS: StyleProfile[] = [
  {
    ...base,
    id: 'documentary',
    name: 'Documentary',
    summary: 'Calm deep narration over slow zooms, with clean white captions low on screen.',
    pacing: { secondsPerShot: 4.5, cutsOnBeat: false },
    hookStyle: 'story-open',
    captionStyle: {
      fontVibe: 'serif',
      sizePct: 4.6,
      positionPct: 80,
      textCase: 'sentence',
      color: '#ffffff',
      highlightColor: '#e2e8f0',
      strokeColor: '#000000',
      strokeWidthPct: 5,
      shadow: true,
      animation: 'fade',
      wordsPerChunk: 4,
      emoji: false,
    },
    editing: { zoomIntensity: 0.25, transition: 'fade', textOverlays: false, progressBar: false, grade: 'warm' },
    format: { targetSeconds: 50, structure: ['hook', 'fact', 'fact', 'history', 'fact', 'cta'], tone: 'calm, authoritative, unhurried' },
    voice: { voiceId: 'am_michael', speed: 0.95 },
  },
  {
    ...base,
    id: 'fast-facts',
    name: 'Fast Facts',
    summary: 'Energetic narration, 1.5 second cuts, big bold word-by-word captions with a yellow highlight.',
    pacing: { secondsPerShot: 1.6, cutsOnBeat: true },
    hookStyle: 'shocking-fact',
    captionStyle: {
      fontVibe: 'bold-sans',
      sizePct: 7.6,
      positionPct: 52,
      textCase: 'upper',
      color: '#ffffff',
      highlightColor: '#facc15',
      strokeColor: '#000000',
      strokeWidthPct: 10,
      shadow: true,
      animation: 'pop',
      wordsPerChunk: 1,
      emoji: true,
    },
    editing: { zoomIntensity: 0.75, transition: 'cut', textOverlays: true, progressBar: true, grade: 'high-contrast' },
    format: { targetSeconds: 30, structure: ['hook', 'fact', 'fact', 'fact', 'fact', 'cta'], tone: 'fast, punchy, slightly amazed' },
    voice: { voiceId: 'am_puck', speed: 1.12 },
  },
  {
    ...base,
    id: 'creepy',
    name: 'Creepy / Mystery',
    summary: 'A low voice over a dark grade and slow push-ins, red highlights, and a cliffhanger open.',
    pacing: { secondsPerShot: 3.2, cutsOnBeat: false },
    hookStyle: 'question',
    captionStyle: {
      fontVibe: 'condensed',
      sizePct: 6.2,
      positionPct: 62,
      textCase: 'upper',
      color: '#e7e5e4',
      highlightColor: '#ef4444',
      strokeColor: '#000000',
      strokeWidthPct: 8,
      shadow: true,
      animation: 'slide-up',
      wordsPerChunk: 2,
      emoji: false,
    },
    editing: { zoomIntensity: 0.4, transition: 'fade', textOverlays: false, progressBar: false, grade: 'dark' },
    format: { targetSeconds: 38, structure: ['hook', 'fact', 'fact', 'twist', 'cta'], tone: 'hushed, ominous, withholding' },
    voice: { voiceId: 'am_fenrir', speed: 0.92 },
  },
  {
    ...base,
    id: 'prehistoric',
    name: 'Prehistoric',
    summary: 'Extinct-animal format with a "when it lived" timeline card, fossils and palaeoart, epic tone.',
    pacing: { secondsPerShot: 3.0, cutsOnBeat: false },
    hookStyle: 'you-wont-believe',
    captionStyle: {
      fontVibe: 'bold-sans',
      sizePct: 6.4,
      positionPct: 72,
      textCase: 'upper',
      color: '#fff7ed',
      highlightColor: '#fb923c',
      strokeColor: '#1c1917',
      strokeWidthPct: 9,
      shadow: true,
      animation: 'pop',
      wordsPerChunk: 2,
      emoji: false,
    },
    editing: { zoomIntensity: 0.5, transition: 'zoom', textOverlays: true, progressBar: true, grade: 'vintage' },
    format: { targetSeconds: 45, structure: ['hook', 'history', 'fact', 'fact', 'twist', 'cta'], tone: 'epic, cinematic, awed' },
    voice: { voiceId: 'am_michael', speed: 0.96 },
    visualBias: 'fossil skeleton museum palaeoart',
  },
];

export function presetById(id: string, extra: StyleProfile[] = []): StyleProfile {
  return [...extra, ...BUILT_IN_PRESETS].find((p) => p.id === id) || BUILT_IN_PRESETS[1];
}

/** A deep copy, so editing a project never mutates the shared preset. */
export function clonePreset(p: StyleProfile): StyleProfile {
  return JSON.parse(JSON.stringify(p)) as StyleProfile;
}
