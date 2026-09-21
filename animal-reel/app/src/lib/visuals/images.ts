import { proxied } from '../api/worker';
import { getBlob, putBlob } from '../db';
import { AppError, type Grade, type VisualAsset } from '../../types';

const memory = new Map<string, HTMLImageElement>();

/**
 * Loads a remote image so the canvas stays readable. The bytes go through the
 * Worker proxy (which sets CORS) and are kept in IndexedDB, so a project still
 * exports after the original URL expires or the phone goes offline.
 */
export async function loadAssetImage(asset: VisualAsset): Promise<HTMLImageElement> {
  const key = asset.blobKey || `asset.${asset.id}`;
  const cached = memory.get(key);
  if (cached?.complete && cached.naturalWidth) return cached;

  let blob = await getBlob(key);
  if (!blob) {
    const res = await fetch(proxied(asset.url), { mode: 'cors' });
    if (!res.ok) {
      throw new AppError('image_fetch_failed', `Could not download the picture for "${asset.credit.source}".`);
    }
    blob = await res.blob();
    await putBlob(key, blob);
    asset.blobKey = key;
  }

  const img = await blobToImage(blob);
  memory.set(key, img);
  return img;
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AppError('image_decode_failed', 'That picture could not be decoded.'));
    };
    img.src = url;
  });
}

export interface Motion {
  fromScale: number;
  toScale: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * Picks a Ken Burns move once per scene so the preview and the export agree.
 * Offsets are in normalised units of the overflow available after cropping.
 */
export function makeMotion(zoomIntensity: number, seed: number): Motion {
  const rnd = mulberry(seed);
  const amount = 0.06 + zoomIntensity * 0.22;
  const zoomIn = rnd() > 0.4;
  const drift = 0.35 + zoomIntensity * 0.5;
  const angle = rnd() * Math.PI * 2;
  const dx = Math.cos(angle) * drift;
  const dy = Math.sin(angle) * drift * 0.6;
  return {
    fromScale: zoomIn ? 1 : 1 + amount,
    toScale: zoomIn ? 1 + amount : 1,
    fromX: -dx / 2,
    fromY: -dy / 2,
    toX: dx / 2,
    toY: dy / 2,
  };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Draws one image into a 9:16 frame. Portrait sources are cropped to fill.
 * Landscape sources are letterboxed over a blurred, zoomed copy of themselves
 * so the frame never shows black bars.
 */
export function drawFitted(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  W: number,
  H: number,
  motion: Motion,
  progress: number,
) {
  const t = easeInOut(Math.min(1, Math.max(0, progress)));
  const scale = motion.fromScale + (motion.toScale - motion.fromScale) * t;
  const panX = motion.fromX + (motion.toX - motion.fromX) * t;
  const panY = motion.fromY + (motion.toY - motion.fromY) * t;

  const iw = Number(img.width) || 1;
  const ih = Number(img.height) || 1;
  const srcRatio = iw / ih;
  const dstRatio = W / H;
  const wideSource = srcRatio > dstRatio * 1.12;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (wideSource) {
    // Blurred background fill.
    ctx.save();
    ctx.filter = 'blur(38px) brightness(0.55) saturate(1.2)';
    drawCover(ctx, img, W, H, 1.35, 0, 0);
    ctx.restore();

    // The real picture, contained, with the Ken Burns move applied to it.
    const fitScale = Math.min(W / iw, H / ih) * (0.94 + (scale - 1) * 0.8);
    const dw = iw * fitScale;
    const dh = ih * fitScale;
    ctx.drawImage(img, (W - dw) / 2 + panX * W * 0.04, (H - dh) / 2 + panY * H * 0.04, dw, dh);
  } else {
    drawCover(ctx, img, W, H, scale, panX, panY);
  }

  ctx.restore();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  W: number,
  H: number,
  scale: number,
  panX: number,
  panY: number,
) {
  const iw = Number(img.width) || 1;
  const ih = Number(img.height) || 1;
  const cover = Math.max(W / iw, H / ih) * scale;
  const dw = iw * cover;
  const dh = ih * cover;
  // Pan is limited to the overflow, so the frame never runs off the picture.
  const slackX = Math.max(0, dw - W) / 2;
  const slackY = Math.max(0, dh - H) / 2;
  const x = (W - dw) / 2 + panX * slackX;
  const y = (H - dh) / 2 + panY * slackY;
  ctx.drawImage(img, x, y, dw, dh);
}

/** The colour grade the style preset asks for, drawn over the picture. */
export function applyGrade(ctx: CanvasRenderingContext2D, W: number, H: number, grade: Grade) {
  ctx.save();
  switch (grade) {
    case 'warm':
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,170,90,0.18)';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'cool':
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(90,150,255,0.18)';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'dark':
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(40,45,70,0.55)';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'high-contrast':
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'vintage':
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(214,180,130,0.35)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(60,40,20,0.2)';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'neutral':
    default:
      break;
  }
  ctx.restore();

  // A light vignette keeps captions readable whatever the picture is doing.
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);

  const top = ctx.createLinearGradient(0, 0, 0, H * 0.22);
  top.addColorStop(0, 'rgba(0,0,0,0.35)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.22);
}
