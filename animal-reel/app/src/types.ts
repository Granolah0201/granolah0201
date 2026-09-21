export type AnimalStatus = 'alive' | 'extinct' | 'unknown';
export type DetectMode = 'alive' | 'extinct' | 'auto';

// ---------------------------------------------------------------- style presets

export type FontVibe = 'bold-sans' | 'rounded' | 'condensed' | 'serif' | 'handwritten' | 'mono';
export type TextCase = 'upper' | 'sentence' | 'lower';
export type CaptionAnimation = 'none' | 'pop' | 'fade' | 'slide-up' | 'bounce';
export type Transition = 'cut' | 'fade' | 'whip' | 'zoom';
export type Grade = 'neutral' | 'warm' | 'cool' | 'dark' | 'high-contrast' | 'vintage';
export type HookStyle = 'question' | 'shocking-fact' | 'you-wont-believe' | 'story-open' | 'countdown';
export type SceneRole = 'hook' | 'fact' | 'history' | 'twist' | 'cta';

export interface CaptionStyle {
  fontVibe: FontVibe;
  /** Font size as a percentage of the 1920px frame height. */
  sizePct: number;
  /** Vertical centre of the caption block, as a percentage of frame height. */
  positionPct: number;
  textCase: TextCase;
  color: string;
  highlightColor: string;
  strokeColor: string;
  /** Outline width as a percentage of the font size. */
  strokeWidthPct: number;
  shadow: boolean;
  animation: CaptionAnimation;
  wordsPerChunk: number;
  emoji: boolean;
}

export interface EditingStyle {
  /** Ken Burns strength, 0 static to 1 aggressive. */
  zoomIntensity: number;
  transition: Transition;
  textOverlays: boolean;
  progressBar: boolean;
  grade: Grade;
}

export interface StyleProfile {
  id: string;
  name: string;
  builtIn: boolean;
  summary: string;
  pacing: { secondsPerShot: number; cutsOnBeat: boolean };
  hookStyle: HookStyle;
  captionStyle: CaptionStyle;
  editing: EditingStyle;
  format: { targetSeconds: number; structure: SceneRole[]; tone: string };
  voice: { voiceId: string; speed: number };
  /** Extra words appended to every visual search, e.g. "fossil museum". */
  visualBias?: string;
  createdAt: number;
  /** Set when the preset was extracted from a reference the user uploaded. */
  derivedFrom?: { name: string; notes: string; thumbnailId?: string };
}

// ---------------------------------------------------------------- research

export interface ResearchFact {
  id: string;
  text: string;
  wow: number;
  sourceSection: string;
  sourceQuote: string;
  visualQuery: string;
  /** Set locally: whether sourceQuote was actually found in the fetched article. */
  verified: boolean;
  sourceUrl: string;
}

export interface Research {
  commonName: string;
  scientificName: string;
  status: AnimalStatus;
  era: string;
  hook: string;
  facts: ResearchFact[];
  history: { summary: string; whenItLived: string; howWeKnow: string; howItWentExtinct: string };
  closingLine: string;
  sources: SourceRef[];
}

export interface SourceRef {
  title: string;
  url: string;
  kind: 'wikipedia' | 'wikidata';
}

// ---------------------------------------------------------------- assets

export type AssetProvider = 'pexels' | 'pixabay' | 'commons' | 'generated' | 'upload';

export interface Credit {
  author: string;
  authorUrl: string;
  source: string;
  sourceUrl: string;
  license: string;
}

export interface VisualAsset {
  id: string;
  provider: AssetProvider;
  kind: 'photo' | 'video' | 'card';
  /** Remote URL. Fetched through the Worker proxy so the canvas stays untainted. */
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  credit: Credit;
  /** Set when the bytes have been cached in IndexedDB. */
  blobKey?: string;
  /** Flagged in the UI when the picture is an illustration rather than a photo. */
  illustration?: boolean;
}

// ---------------------------------------------------------------- script + scenes

export interface CaptionWord {
  word: string;
  /** Seconds from the start of the scene. */
  start: number;
  end: number;
}

export interface Scene {
  id: string;
  text: string;
  role: SceneRole;
  visualQuery: string;
  visualKind: string;
  factId: string;
  emoji: string;
  /** Seconds. Derived from the voiceover once it exists, editable before that. */
  duration: number;
  asset?: VisualAsset;
  /** Alternatives already fetched for this scene, so swapping costs no API call. */
  alternatives: VisualAsset[];
  /** Key of the rendered voiceover clip in the audio store. */
  audioKey?: string;
  words: CaptionWord[];
  /** Ken Burns parameters chosen once so preview and export match. */
  motion?: { fromScale: number; toScale: number; fromX: number; fromY: number; toX: number; toY: number };
}

export interface Project {
  id: string;
  animal: string;
  title: string;
  mode: DetectMode;
  presetId: string;
  /** A copy of the preset as it was when the project was generated. */
  style: StyleProfile;
  voiceId: string;
  voiceSpeed: number;
  research?: Research;
  scenes: Scene[];
  caption: string;
  hashtags: string[];
  musicId: string | null;
  musicGain: number;
  createdAt: number;
  updatedAt: number;
  /** Total voiceover length in seconds, once rendered. */
  audioDuration?: number;
  thumbnailKey?: string;
}

// ---------------------------------------------------------------- misc

export interface ProgressUpdate {
  stage: string;
  detail?: string;
  /** 0-1, or null when the length is unknown. */
  value: number | null;
}

export type ProgressFn = (u: ProgressUpdate) => void;

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
