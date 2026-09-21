import { lineCall, researchCall, scriptCall, styleCall } from './api/worker';
import { getSettings } from './config';
import { putBlob } from './db';
import { buildSourceText, fetchArticle, findArticle, sectionForQuote, verifyQuote, type WikiArticle } from './research/wikipedia';
import { eraLine, fetchWikidata, type WikidataFacts } from './research/wikidata';
import { speechBounds, timeSentence } from './captions/timing';
import { clipToWav, concatClips, speak, splitSentences, type Clip } from './tts/kokoro';
import { makeMotion } from './visuals/images';
import { aiIllustration, searchVisuals } from './visuals/search';
import { matchVoice } from './voices';
import {
  AppError,
  type CaptionWord,
  type DetectMode,
  type Project,
  type Research,
  type ResearchFact,
  type Scene,
  type SceneRole,
  type StyleProfile,
  type ProgressFn,
  type VisualAsset,
} from '../types';

const WORDS_PER_MINUTE = 150;

export interface GenerateInput {
  animal: string;
  mode: DetectMode;
  style: StyleProfile;
  voiceId: string;
  voiceSpeed: number;
}

/**
 * Research plus script. Two Gemini calls, the bulk one on Flash-Lite and the
 * script on Flash, which is what keeps a whole reel inside the free tier.
 */
export async function generateScript(input: GenerateInput, onProgress: ProgressFn): Promise<Project> {
  onProgress({ stage: 'Looking up the animal', value: 0.05 });
  const match = await findArticle(input.animal);
  const article = await fetchArticle(match.title);

  onProgress({ stage: 'Reading the article', detail: article.title, value: 0.15 });
  let wikidata: WikidataFacts | null = null;
  if (article.wikibaseId) {
    try {
      wikidata = await fetchWikidata(article.wikibaseId);
    } catch {
      // Wikidata is a bonus; the article alone is enough to write from.
    }
  }

  onProgress({ stage: 'Finding the surprising facts', detail: 'Gemini Flash-Lite', value: 0.3 });
  const { research: raw } = await researchCall({
    animal: article.title,
    mode: input.mode,
    wantFacts: Math.max(5, Math.min(8, input.style.format.structure.filter((r) => r === 'fact').length + 4)),
    sourceText: buildSourceText(article),
    wikidata: wikidata?.text || '',
  });

  const research = shapeResearch(raw, article, wikidata);

  onProgress({ stage: 'Writing the script', detail: 'Gemini Flash', value: 0.55 });
  const useFlash = getSettings().useFlashForScript;
  let scriptResponse;
  try {
    scriptResponse = await scriptCall({
      animal: research.commonName || article.title,
      status: research.status,
      targetSeconds: input.style.format.targetSeconds,
      structure: input.style.format.structure,
      tone: input.style.format.tone,
      hookStyle: input.style.hookStyle,
      emoji: input.style.captionStyle.emoji,
      research: stripForPrompt(research),
      useFlash,
    });
  } catch (err) {
    // The 20-a-day Flash quota is the one that runs out. Finish on Flash-Lite
    // rather than losing the research we already paid for.
    if (useFlash && err instanceof AppError && err.code === 'gemini_quota') {
      onProgress({ stage: 'Flash quota is gone, finishing on Flash-Lite', value: 0.6 });
      scriptResponse = await scriptCall({
        animal: research.commonName || article.title,
        status: research.status,
        targetSeconds: input.style.format.targetSeconds,
        structure: input.style.format.structure,
        tone: input.style.format.tone,
        hookStyle: input.style.hookStyle,
        emoji: input.style.captionStyle.emoji,
        research: stripForPrompt(research),
        useFlash: false,
      });
    } else {
      throw err;
    }
  }

  const scenes = shapeScenes(scriptResponse.script, input.style);
  const now = Date.now();
  const project: Project = {
    id: `p-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    animal: input.animal,
    title: String(scriptResponse.script.title || `${research.commonName}`),
    mode: input.mode,
    presetId: input.style.id,
    style: input.style,
    voiceId: input.voiceId,
    voiceSpeed: input.voiceSpeed,
    research,
    scenes,
    caption: String(scriptResponse.script.caption || ''),
    hashtags: Array.isArray(scriptResponse.script.hashtags) ? scriptResponse.script.hashtags.map(String) : [],
    musicId: null,
    musicGain: 0.22,
    createdAt: now,
    updatedAt: now,
  };

  onProgress({ stage: 'Script ready', value: 1 });
  return project;
}

function stripForPrompt(r: Research) {
  return {
    commonName: r.commonName,
    scientificName: r.scientificName,
    status: r.status,
    era: r.era,
    hook: r.hook,
    closingLine: r.closingLine,
    history: r.history,
    // Unverified facts never reach the script writer.
    facts: r.facts.filter((f) => f.verified).map(({ id, text, wow, visualQuery }) => ({ id, text, wow, visualQuery })),
  };
}

function shapeResearch(raw: any, article: WikiArticle, wikidata: WikidataFacts | null): Research {
  const facts: ResearchFact[] = (raw?.facts || []).map((f: any, i: number): ResearchFact => {
    const quote = String(f.sourceQuote || '');
    const verified = verifyQuote(article, quote);
    return {
      id: String(f.id || `fact-${i}`),
      text: String(f.text || '').trim(),
      wow: Number(f.wow) || 5,
      sourceSection: sectionForQuote(article, quote) || String(f.sourceSection || ''),
      sourceQuote: quote,
      visualQuery: String(f.visualQuery || article.title),
      verified,
      sourceUrl: article.url,
    };
  });

  const status = (['alive', 'extinct', 'unknown'] as const).includes(raw?.status)
    ? raw.status
    : wikidata?.status || 'unknown';

  return {
    commonName: String(raw?.commonName || article.title),
    scientificName: String(raw?.scientificName || wikidata?.taxonName || ''),
    status,
    era: String(raw?.era || eraLine(wikidata) || ''),
    hook: String(raw?.hook || ''),
    facts: facts.sort((a, b) => Number(b.verified) - Number(a.verified) || b.wow - a.wow),
    history: {
      summary: String(raw?.history?.summary || ''),
      whenItLived: String(raw?.history?.whenItLived || ''),
      howWeKnow: String(raw?.history?.howWeKnow || ''),
      howItWentExtinct: String(raw?.history?.howItWentExtinct || ''),
    },
    closingLine: String(raw?.closingLine || ''),
    sources: [
      { title: article.title, url: article.url, kind: 'wikipedia' },
      ...(wikidata ? [{ title: `Wikidata ${wikidata.id}`, url: wikidata.url, kind: 'wikidata' as const }] : []),
    ],
  };
}

function shapeScenes(script: any, style: StyleProfile): Scene[] {
  const rawScenes: any[] = Array.isArray(script?.scenes) ? script.scenes : [];
  return rawScenes
    .filter((s) => String(s?.text || '').trim())
    .map((s, i): Scene => {
      const text = String(s.text).trim();
      const duration = estimateDuration(text, style);
      return {
        id: `s${i}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        role: (['hook', 'fact', 'history', 'twist', 'cta'] as SceneRole[]).includes(s.role) ? s.role : 'fact',
        visualQuery: String(s.visualQuery || '').trim(),
        visualKind: String(s.visualKind || 'photo'),
        factId: String(s.factId || ''),
        emoji: style.captionStyle.emoji ? String(s.emoji || '') : '',
        duration,
        alternatives: [],
        words: timeSentence(text, 0, 0, duration),
        motion: makeMotion(style.editing.zoomIntensity, i * 7919 + text.length),
      };
    });
}

/** Rough timing used before the voiceover exists, so the editor is usable at once. */
export function estimateDuration(text: string, style: StyleProfile): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const speed = style.voice.speed || 1;
  const spoken = (words / WORDS_PER_MINUTE) * 60 / speed;
  return Math.max(1.0, Math.round((spoken + 0.35) * 100) / 100);
}

// ------------------------------------------------------------------- visuals

/** Fills every scene with a picture, preferring the sources that cost nothing. */
export async function attachVisuals(project: Project, onProgress: ProgressFn): Promise<Project> {
  const extinct = project.research?.status === 'extinct';
  const bias = [project.style.visualBias, extinct ? 'fossil skeleton museum' : ''].filter(Boolean).join(' ');

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    onProgress({
      stage: 'Finding pictures',
      detail: `${i + 1} of ${project.scenes.length}: ${scene.visualQuery}`,
      value: i / project.scenes.length,
    });
    if (scene.asset) continue;

    const query = scene.visualQuery || project.animal;
    let results: VisualAsset[] = [];
    try {
      results = await searchVisuals(query, { bias, preferCommons: extinct, limit: 10 });
    } catch (err) {
      // One provider being out of quota must not empty the whole reel.
      if (!(err instanceof AppError)) throw err;
      onProgress({ stage: 'Picture search hit a limit', detail: err.message, value: i / project.scenes.length });
    }

    if (!results.length) {
      try {
        results = await searchVisuals(project.research?.commonName || project.animal, { bias, preferCommons: extinct, limit: 8 });
      } catch {
        results = [];
      }
    }

    // Do not put the same picture on two scenes in a row.
    const used = new Set(project.scenes.slice(0, i).map((s) => s.asset?.id));
    const pick = results.find((r) => !used.has(r.id)) || results[0];

    scene.asset = pick || aiIllustration(`${project.research?.commonName || project.animal}, ${query}`);
    scene.alternatives = results.slice(0, 8);
  }

  project.updatedAt = Date.now();
  onProgress({ stage: 'Pictures ready', value: 1 });
  return project;
}

/** Fetches a fresh set of options for one scene, for the swap-image sheet. */
export async function optionsForScene(project: Project, sceneIndex: number, queryOverride?: string): Promise<VisualAsset[]> {
  const scene = project.scenes[sceneIndex];
  const extinct = project.research?.status === 'extinct';
  const query = (queryOverride || scene.visualQuery || project.animal).trim();
  const results = await searchVisuals(query, {
    bias: project.style.visualBias,
    preferCommons: extinct,
    limit: 16,
  });
  return results.length ? results : [aiIllustration(query)];
}

// --------------------------------------------------------------------- voice

/**
 * Renders the voiceover one sentence at a time, then uses each sentence's
 * measured length to give every word a caption slot.
 */
export async function renderVoice(project: Project, onProgress: ProgressFn, onlyMissing = false): Promise<Project> {
  const total = project.scenes.length;

  for (let i = 0; i < total; i++) {
    if (onlyMissing && project.scenes[i].audioKey) continue;
    onProgress({ stage: 'Speaking the script', detail: `line ${i + 1} of ${total}`, value: (i / total) * 0.95 });
    await renderSceneVoice(project, i, onProgress);
  }

  project.audioDuration = project.scenes.reduce((n, s) => n + s.duration, 0);
  project.updatedAt = Date.now();
  onProgress({ stage: 'Voiceover ready', value: 1 });
  return project;
}

/** Speaks one line and gives its words their caption slots. */
export async function renderSceneVoice(project: Project, index: number, onProgress: ProgressFn): Promise<Scene> {
  const scene = project.scenes[index];
  const sentences = splitSentences(scene.text);
  const clips: Clip[] = [];
  const words: CaptionWord[] = [];
  let at = 0;

  for (const sentence of sentences) {
    const clip = await speak(sentence, project.voiceId, project.voiceSpeed, onProgress);
    const bounds = speechBounds(clip);
    words.push(...timeSentence(sentence, at, bounds.start, bounds.end));
    clips.push(clip);
    at += clip.duration + 0.12;
  }

  const joined = concatClips(clips);
  const key = `audio.${project.id}.${scene.id}`;
  await putBlob(key, clipToWav(joined));

  scene.audioKey = key;
  scene.words = words;
  // A short beat after the last word keeps the cut from feeling clipped.
  scene.duration = Math.max(1.0, joined.duration + 0.22);
  return scene;
}

// ----------------------------------------------------------- single-line edit

export async function regenerateLine(project: Project, sceneIndex: number, instruction = ''): Promise<Scene> {
  const scene = project.scenes[sceneIndex];
  const fact = project.research?.facts.find((f) => f.id === scene.factId);
  const neighbours = [project.scenes[sceneIndex - 1]?.text, project.scenes[sceneIndex + 1]?.text].filter(Boolean) as string[];

  const { line } = await lineCall({
    animal: project.research?.commonName || project.animal,
    line: scene.text,
    role: scene.role,
    tone: project.style.format.tone,
    supportingFact: fact ? `${fact.text} (source: ${fact.sourceQuote})` : '',
    neighbours,
    instruction,
  });

  const text = String(line.text || scene.text).trim();
  return {
    ...scene,
    text,
    visualQuery: String(line.visualQuery || scene.visualQuery),
    emoji: project.style.captionStyle.emoji ? String(line.emoji || scene.emoji) : '',
    duration: estimateDuration(text, project.style),
    words: timeSentence(text, 0, 0, estimateDuration(text, project.style)),
    // The voice for this line is stale now.
    audioKey: undefined,
  };
}

// --------------------------------------------------------------- style upload

/** Turns an uploaded reel or screenshots into a saved, editable preset. */
export async function extractStyle(files: File[], name: string, notes: string): Promise<StyleProfile> {
  if (!files.length) throw new AppError('no_files', 'Pick a reel or a few screenshots first.');
  const { style } = await styleCall(files, notes);
  const voice = matchVoice(style?.voice?.gender || 'either', style?.voice?.energy || 'calm');

  const id = `ref-${Date.now().toString(36)}`;
  const profile: StyleProfile = {
    id,
    name: name.trim() || 'Reference style',
    builtIn: false,
    summary: String(style?.summary || ''),
    pacing: {
      secondsPerShot: clamp(Number(style?.pacing?.secondsPerShot) || 2.5, 0.8, 8),
      cutsOnBeat: !!style?.pacing?.cutsOnBeat,
    },
    hookStyle: style?.hookStyle || 'shocking-fact',
    captionStyle: {
      fontVibe: style?.captionStyle?.fontVibe || 'bold-sans',
      sizePct: clamp(Number(style?.captionStyle?.sizePct) || 6.5, 3.5, 12),
      positionPct: clamp(Number(style?.captionStyle?.positionPct) || 62, 12, 90),
      textCase: style?.captionStyle?.textCase || 'upper',
      color: hex(style?.captionStyle?.color, '#ffffff'),
      highlightColor: hex(style?.captionStyle?.highlightColor, '#facc15'),
      strokeColor: hex(style?.captionStyle?.strokeColor, '#000000'),
      strokeWidthPct: clamp(Number(style?.captionStyle?.strokeWidthPct) || 8, 0, 14),
      shadow: style?.captionStyle?.shadow !== false,
      animation: style?.captionStyle?.animation || 'pop',
      wordsPerChunk: clamp(Math.round(Number(style?.captionStyle?.wordsPerChunk) || 2), 1, 4),
      emoji: !!style?.captionStyle?.emoji,
    },
    editing: {
      zoomIntensity: clamp(Number(style?.editing?.zoomIntensity) ?? 0.5, 0, 1),
      transition: style?.editing?.transition || 'cut',
      textOverlays: !!style?.editing?.textOverlays,
      progressBar: !!style?.editing?.progressBar,
      grade: style?.editing?.grade || 'neutral',
    },
    format: {
      targetSeconds: clamp(Number(style?.format?.targetSeconds) || 32, 10, 90),
      structure: shapeStructure(style?.format?.structure),
      tone: String(style?.format?.tone || 'clear and punchy'),
    },
    voice: { voiceId: voice.id, speed: clamp(Number(style?.voice?.speed) || voice.speed, 0.7, 1.5) },
    createdAt: Date.now(),
    derivedFrom: { name: files.map((f) => f.name).join(', ').slice(0, 120), notes },
  };

  // Keep a thumbnail of the first frame or screenshot for the Library card.
  try {
    const thumb = await thumbnailFor(files[0]);
    if (thumb) {
      const key = `preset.thumb.${id}`;
      await putBlob(key, thumb);
      profile.derivedFrom!.thumbnailId = key;
    }
  } catch {
    /* thumbnails are cosmetic */
  }

  return profile;
}

function shapeStructure(raw: unknown): SceneRole[] {
  const allowed: SceneRole[] = ['hook', 'fact', 'history', 'twist', 'cta'];
  const list = Array.isArray(raw) ? raw.filter((r): r is SceneRole => allowed.includes(r as SceneRole)) : [];
  if (!list.length) return ['hook', 'fact', 'fact', 'fact', 'cta'];
  if (list[0] !== 'hook') list.unshift('hook');
  return list.slice(0, 10);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

function hex(v: unknown, fallback: string): string {
  const s = String(v || '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s : fallback;
}

async function thumbnailFor(file: File): Promise<Blob | null> {
  if (file.type.startsWith('image/')) return file;
  if (!file.type.startsWith('video/')) return null;

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('video decode failed'));
    });
    video.currentTime = Math.min(1, (video.duration || 2) / 3);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 1200);
    });
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = Math.round((360 * video.videoHeight) / Math.max(1, video.videoWidth));
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  } finally {
    URL.revokeObjectURL(url);
  }
}
