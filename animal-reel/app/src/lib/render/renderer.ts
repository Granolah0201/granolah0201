import { chunkAt, chunkWords, type CaptionChunk } from '../captions/timing';
import { applyGrade, drawFitted, loadAssetImage, makeMotion, type Motion } from '../visuals/images';
import { fontFor, trackingFor } from './fonts';
import type { Project, Scene, TextCase, VisualAsset } from '../../types';

export const FRAME_W = 1080;
export const FRAME_H = 1920;

interface Shot {
  img: HTMLImageElement | null;
  motion: Motion;
}

interface Track {
  scene: Scene;
  /** One or more pictures, cut at the preset's shot length. */
  shots: Shot[];
  shotDuration: number;
  start: number;
  end: number;
  chunks: CaptionChunk[];
}

/**
 * Draws the reel onto a 1080x1920 canvas. The preview and the exporter both go
 * through this, so what you scrub is exactly what gets encoded.
 */
export class ReelRenderer {
  private tracks: Track[] = [];
  private constructor(
    private project: Project,
    tracks: Track[],
  ) {
    this.tracks = tracks;
  }

  static async create(project: Project, onSceneReady?: (index: number) => void): Promise<ReelRenderer> {
    const tracks: Track[] = [];
    const perShot = Math.max(0.8, project.style.pacing.secondsPerShot);
    let at = 0;

    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      const duration = Math.max(0.6, scene.duration || 2.5);

      // A long line gets more than one picture, so a preset asking for 1.5
      // second cuts actually cuts every 1.5 seconds.
      const wanted = Math.max(1, Math.round(duration / perShot));
      const pool = pickShotAssets(scene, wanted);
      const shots: Shot[] = [];
      for (let k = 0; k < pool.length; k++) {
        let img: HTMLImageElement | null = null;
        if (pool[k]) {
          try {
            img = await loadAssetImage(pool[k]!);
          } catch {
            // A missing picture must not stop the render; that shot falls back to a card.
            img = null;
          }
        }
        shots.push({
          motion: k === 0 && scene.motion ? scene.motion : makeMotion(project.style.editing.zoomIntensity, hash(scene.id) + i * 31 + k * 7),
          img,
        });
      }

      tracks.push({
        scene,
        shots: shots.length ? shots : [{ img: null, motion: makeMotion(project.style.editing.zoomIntensity, i) }],
        shotDuration: duration / Math.max(1, shots.length),
        start: at,
        end: at + duration,
        chunks: chunkWords(scene.words, project.style.captionStyle.wordsPerChunk),
      });
      at += duration;
      onSceneReady?.(i);
    }
    return new ReelRenderer(project, tracks);
  }

  get duration(): number {
    return this.tracks.length ? this.tracks[this.tracks.length - 1].end : 0;
  }

  get sceneCount(): number {
    return this.tracks.length;
  }

  sceneIndexAt(t: number): number {
    const i = this.tracks.findIndex((tr) => t >= tr.start && t < tr.end);
    return i < 0 ? Math.max(0, this.tracks.length - 1) : i;
  }

  sceneStart(index: number): number {
    return this.tracks[index]?.start ?? 0;
  }

  drawFrame(ctx: CanvasRenderingContext2D, t: number) {
    const W = FRAME_W;
    const H = FRAME_H;
    const style = this.project.style;

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const index = this.sceneIndexAt(t);
    const track = this.tracks[index];
    if (!track) {
      ctx.restore();
      return;
    }

    const local = Math.min(track.end - track.start, Math.max(0, t - track.start));

    // Outgoing scene, for transitions that need two pictures.
    const TRANSITION = 0.32;
    const prev = this.tracks[index - 1];
    const incoming = prev && local < TRANSITION && style.editing.transition !== 'cut' ? local / TRANSITION : 1;

    if (incoming < 1 && prev) {
      this.paintScene(ctx, prev, prev.end - prev.start, W, H);
      ctx.save();
      switch (style.editing.transition) {
        case 'fade':
          ctx.globalAlpha = incoming;
          break;
        case 'zoom': {
          ctx.globalAlpha = incoming;
          const s = 1.12 - 0.12 * incoming;
          ctx.translate(W / 2, H / 2);
          ctx.scale(s, s);
          ctx.translate(-W / 2, -H / 2);
          break;
        }
        case 'whip':
          ctx.globalAlpha = Math.min(1, incoming * 1.6);
          ctx.translate((1 - incoming) * W * 0.5, 0);
          break;
      }
      this.paintScene(ctx, track, local, W, H);
      ctx.restore();
    } else {
      this.paintScene(ctx, track, local, W, H);
    }

    applyGrade(ctx, W, H, style.editing.grade);

    if (this.shotAt(track, local)?.illustration) this.drawIllustrationTag(ctx, W, H);
    if (style.editing.textOverlays) this.drawOverlay(ctx, track, local, W, H);
    // Word timings are stored relative to the scene, so the caption clock is too.
    this.drawCaption(ctx, track, local, W, H);
    if (style.editing.progressBar) this.drawProgressBar(ctx, t, W, H);

    ctx.restore();
  }

  /** `local` is seconds since this scene started. */
  private paintScene(ctx: CanvasRenderingContext2D, track: Track, local: number, W: number, H: number) {
    const index = Math.min(track.shots.length - 1, Math.max(0, Math.floor(local / track.shotDuration)));
    const shot = track.shots[index];
    const progress = (local - index * track.shotDuration) / track.shotDuration;

    if (shot?.img) {
      drawFitted(ctx, shot.img, W, H, shot.motion, Math.min(1, Math.max(0, progress)));
    } else {
      this.drawCard(ctx, track.scene, W, H);
    }
  }

  /** The fallback picture: a graded gradient with the scene's subject on it. */
  private drawCard(ctx: CanvasRenderingContext2D, scene: Scene, W: number, H: number) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#111827');
    g.addColorStop(0.55, '#1f2937');
    g.addColorStop(1, '#0b0f14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 3;
    for (let i = -H; i < W; i += 90) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = fontFor('condensed', 58);
    wrapText(ctx, scene.visualQuery.toUpperCase(), W / 2, H * 0.46, W * 0.8, 72).forEach((line, i, all) =>
      ctx.fillText(line, W / 2, H * 0.46 + (i - (all.length - 1) / 2) * 72),
    );
    ctx.restore();
  }

  /** Title card for the hook and the "when it lived" card for extinct animals. */
  private drawOverlay(ctx: CanvasRenderingContext2D, track: Track, local: number, W: number, H: number) {
    const research = this.project.research;
    const era = research?.era || research?.history.whenItLived || '';
    const isFirst = track === this.tracks[0];
    const wantsTimeline = track.scene.role === 'history' || (isFirst && !!era);
    if (!wantsTimeline || !era) return;

    const fade = Math.min(1, local / 0.4) * Math.min(1, Math.max(0, (track.end - track.start - local) / 0.5));
    if (fade <= 0.02) return;

    ctx.save();
    ctx.globalAlpha = fade;
    const boxW = W * 0.78;
    const boxH = 190;
    const x = (W - boxW) / 2;
    const y = H * 0.16;

    ctx.fillStyle = 'rgba(8,12,18,0.72)';
    roundRect(ctx, x, y, boxW, boxH, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,146,60,0.75)';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, boxW, boxH, 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fb923c';
    ctx.font = fontFor('condensed', 34);
    ctx.fillText('WHEN IT LIVED', W / 2, y + 62);

    ctx.fillStyle = '#fff7ed';
    ctx.font = fontFor('bold-sans', 48);
    const lines = wrapText(ctx, era, W / 2, 0, boxW * 0.88, 56).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, W / 2, y + 126 + i * 54));
    ctx.restore();
  }

  private drawIllustrationTag(ctx: CanvasRenderingContext2D, W: number, _H: number) {
    ctx.save();
    ctx.font = fontFor('bold-sans', 26);
    const label = 'AI ILLUSTRATION';
    const w = ctx.measureText(label).width + 36;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, W - w - 28, 36, w, 48, 24);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.textAlign = 'center';
    ctx.fillText(label, W - w / 2 - 28, 68);
    ctx.restore();
  }

  /** `local` is seconds since this scene started, matching the stored word times. */
  private drawCaption(ctx: CanvasRenderingContext2D, track: Track, local: number, W: number, H: number) {
    const cs = this.project.style.captionStyle;
    const hit = chunkAt(track.chunks, local);
    if (!hit) return;

    const size = (cs.sizePct / 100) * H;
    const font = fontFor(cs.fontVibe, size);
    ctx.save();
    ctx.font = font;
    // letterSpacing is only in newer Safari, so set it behind a guard.
    const spacing = trackingFor(cs.fontVibe);
    if ('letterSpacing' in ctx && spacing) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(spacing * size).toFixed(2)}px`;
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const age = local - hit.chunk.start;
    const anim = animationFactor(cs.animation, age);
    const maxWidth = W * 0.86;
    const words = hit.chunk.words.map((w) => applyCase(w.word, cs.textCase));
    const emoji = cs.emoji && track.scene.emoji && hit.chunk === track.chunks[0] ? ` ${track.scene.emoji}` : '';

    // Lay the chunk out on as few lines as it needs.
    const lines = layoutWords(ctx, words, maxWidth);
    const lineHeight = size * 1.14;
    const centreY = (cs.positionPct / 100) * H;
    const startY = centreY - ((lines.length - 1) * lineHeight) / 2;

    ctx.translate(W / 2, centreY);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-W / 2, -centreY + anim.offsetY * size);
    ctx.globalAlpha = anim.alpha;

    let wordCursor = 0;
    lines.forEach((line, li) => {
      const widths = line.map((w) => ctx.measureText(w + ' ').width);
      const lineWidth = widths.reduce((a, b) => a + b, 0) - (widths.length ? ctx.measureText(' ').width : 0);
      let x = W / 2 - lineWidth / 2;
      const y = startY + li * lineHeight;

      line.forEach((word, wi) => {
        const globalIndex = wordCursor + wi;
        const active = globalIndex === hit.wordIndex;
        const text = word + (li === lines.length - 1 && wi === line.length - 1 ? emoji : '');
        const wordWidth = ctx.measureText(word + ' ').width;

        if (cs.shadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = size * 0.18;
          ctx.shadowOffsetY = size * 0.05;
        }
        if (cs.strokeWidthPct > 0) {
          ctx.strokeStyle = cs.strokeColor;
          ctx.lineWidth = (cs.strokeWidthPct / 100) * size;
          ctx.strokeText(text, x + wordWidth / 2, y);
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = active ? cs.highlightColor : cs.color;
        ctx.fillText(text, x + wordWidth / 2, y);
        x += wordWidth;
      });
      wordCursor += line.length;
    });

    ctx.restore();
  }

  /** The asset showing at this moment, used for the illustration label. */
  private shotAt(track: Track, local: number): { illustration?: boolean } | undefined {
    const index = Math.min(track.shots.length - 1, Math.max(0, Math.floor(local / track.shotDuration)));
    const assets = pickShotAssets(track.scene, track.shots.length);
    return assets[index] || undefined;
  }

  private drawProgressBar(ctx: CanvasRenderingContext2D, t: number, W: number, H: number) {
    const total = this.duration || 1;
    const pct = Math.min(1, t / total);
    const h = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, H - h, W, h);
    ctx.fillStyle = this.project.style.captionStyle.highlightColor;
    ctx.fillRect(0, H - h, W * pct, h);
    ctx.restore();
  }
}

function animationFactor(anim: string, age: number): { scale: number; alpha: number; offsetY: number } {
  const d = 0.22;
  const p = Math.min(1, Math.max(0, age / d));
  switch (anim) {
    case 'pop':
      return { scale: 1 + 0.18 * (1 - p) * Math.cos(p * Math.PI * 1.2), alpha: Math.min(1, p * 2.2), offsetY: 0 };
    case 'bounce':
      return { scale: 1, alpha: Math.min(1, p * 2.5), offsetY: -0.32 * (1 - p) * Math.cos(p * Math.PI * 2.4) };
    case 'slide-up':
      return { scale: 1, alpha: Math.min(1, p * 1.8), offsetY: 0.5 * (1 - p) };
    case 'fade':
      return { scale: 1, alpha: p, offsetY: 0 };
    default:
      return { scale: 1, alpha: 1, offsetY: 0 };
  }
}

function applyCase(word: string, c: TextCase): string {
  if (c === 'upper') return word.toUpperCase();
  if (c === 'lower') return word.toLowerCase();
  return word;
}

function layoutWords(ctx: CanvasRenderingContext2D, words: string[], maxWidth: number): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  for (const w of words) {
    const candidate = [...current, w];
    if (ctx.measureText(candidate.join(' ')).width > maxWidth && current.length) {
      lines.push(current);
      current = [w];
    } else {
      current = candidate;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, _x: number, _y: number, maxWidth: number, _lh: number): string[] {
  return layoutWords(ctx, text.split(/\s+/).filter(Boolean), maxWidth).map((l) => l.join(' '));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The pictures a scene cuts between: its chosen asset first, then whatever
 * distinct alternatives were already fetched for it.
 */
function pickShotAssets(scene: Scene, wanted: number): (VisualAsset | null)[] {
  const out: (VisualAsset | null)[] = scene.asset ? [scene.asset] : [null];
  const seen = new Set([scene.asset?.id]);
  for (const alt of scene.alternatives || []) {
    if (out.length >= wanted) break;
    if (seen.has(alt.id)) continue;
    seen.add(alt.id);
    out.push(alt);
  }
  return out;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
