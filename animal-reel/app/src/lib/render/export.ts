import { bufferToWav, sliceBuffer } from '../audio/mix';
import { FRAME_H, FRAME_W, type ReelRenderer } from './renderer';
import { AppError, type ProgressFn } from '../../types';

export type ExportMode = 'webcodecs' | 'recorder';

export interface ExportResult {
  blob: Blob;
  filename: string;
  mode: ExportMode;
  durationSeconds: number;
}

export interface Capabilities {
  webcodecs: boolean;
  avc: boolean;
  aac: boolean;
  recorderMp4: boolean;
  mode: ExportMode | 'none';
  reason: string;
}

export async function detectCapabilities(): Promise<Capabilities> {
  const webcodecs = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
  let avc = false;
  let aac = false;
  if (webcodecs) {
    try {
      const { canEncodeVideo, canEncodeAudio } = await import('mediabunny');
      avc = await canEncodeVideo('avc', { width: FRAME_W, height: FRAME_H });
      aac = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 });
    } catch {
      avc = false;
      aac = false;
    }
  }
  const recorderMp4 =
    typeof MediaRecorder !== 'undefined' &&
    (MediaRecorder.isTypeSupported('video/mp4') || MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2'));

  if (avc && aac) {
    return { webcodecs, avc, aac, recorderMp4, mode: 'webcodecs', reason: 'Encoding with WebCodecs.' };
  }
  if (recorderMp4) {
    return {
      webcodecs,
      avc,
      aac,
      recorderMp4,
      mode: 'recorder',
      reason: avc
        ? 'This iOS version cannot encode AAC with WebCodecs, so the export records in real time instead.'
        : 'This iOS version has no WebCodecs H.264 encoder, so the export records in real time instead.',
    };
  }
  return { webcodecs, avc, aac, recorderMp4, mode: 'none', reason: 'This browser cannot produce an MP4.' };
}

export async function exportReel(
  renderer: ReelRenderer,
  mixdown: AudioBuffer,
  filenameBase: string,
  onProgress: ProgressFn,
  forceMode?: ExportMode,
): Promise<ExportResult> {
  const caps = await detectCapabilities();
  const mode = forceMode || (caps.mode === 'none' ? null : caps.mode);
  if (!mode) {
    throw new AppError(
      'no_encoder',
      'This browser cannot make an MP4.',
      'Update to iOS 17 or later, or open the app in Safari rather than an in-app browser.',
    );
  }
  const filename = `${sanitize(filenameBase)}.mp4`;
  return mode === 'webcodecs'
    ? exportWithWebCodecs(renderer, mixdown, filename, onProgress)
    : exportWithRecorder(renderer, mixdown, filename, onProgress);
}

const FPS = 30;

async function exportWithWebCodecs(
  renderer: ReelRenderer,
  mixdown: AudioBuffer,
  filename: string,
  onProgress: ProgressFn,
): Promise<ExportResult> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH } = await import('mediabunny');

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new AppError('no_canvas', 'Could not open a 2D canvas to draw the frames.');

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  const audioSource = new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_HIGH });
  output.addAudioTrack(audioSource);

  await output.start();

  const duration = Math.max(renderer.duration, mixdown.duration);
  const frames = Math.max(1, Math.ceil(duration * FPS));

  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    renderer.drawFrame(ctx, t);
    await videoSource.add(t, 1 / FPS);
    if (i % 6 === 0) {
      onProgress({ stage: 'Encoding video', detail: `frame ${i + 1} of ${frames}`, value: (i / frames) * 0.86 });
      // Let Safari breathe so the tab is not killed mid-export.
      await nextTick();
    }
  }

  onProgress({ stage: 'Encoding audio', value: 0.9 });
  // The encoder is happier with a few big chunks than one enormous buffer.
  const chunkCtx = new OfflineAudioContext(mixdown.numberOfChannels, 1, mixdown.sampleRate);
  for (const chunk of sliceBuffer(chunkCtx, mixdown, 5)) {
    await audioSource.add(chunk);
  }

  onProgress({ stage: 'Writing the MP4', value: 0.95 });
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new AppError('mux_failed', 'The muxer produced no file.');

  onProgress({ stage: 'Done', value: 1 });
  return { blob: new Blob([buffer], { type: 'video/mp4' }), filename, mode: 'webcodecs', durationSeconds: duration };
}

/**
 * The older-iOS path. Safari records H.264/AAC straight out of MediaRecorder,
 * but only in real time, so this takes as long as the reel is.
 */
async function exportWithRecorder(
  renderer: ReelRenderer,
  mixdown: AudioBuffer,
  filename: string,
  onProgress: ProgressFn,
): Promise<ExportResult> {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new AppError('no_canvas', 'Could not open a 2D canvas to draw the frames.');

  const duration = Math.max(renderer.duration, mixdown.duration);
  const audioCtx = new AudioContext({ sampleRate: mixdown.sampleRate });
  await audioCtx.resume();

  const dest = audioCtx.createMediaStreamDestination();
  const src = audioCtx.createBufferSource();
  src.buffer = mixdown;
  src.connect(dest);

  const stream = canvas.captureStream(FPS);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')
    ? 'video/mp4;codecs=avc1,mp4a.40.2'
    : 'video/mp4';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) parts.push(e.data);
  };

  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(250);
  const startedAt = performance.now();
  src.start();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - startedAt) / 1000;
      if (t >= duration) {
        renderer.drawFrame(ctx, duration);
        resolve();
        return;
      }
      renderer.drawFrame(ctx, t);
      onProgress({
        stage: 'Recording in real time',
        detail: `${t.toFixed(1)}s of ${duration.toFixed(1)}s - keep the screen on`,
        value: (t / duration) * 0.95,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // A short tail so the last frame and the last words are definitely in the file.
  await new Promise((r) => setTimeout(r, 350));
  recorder.stop();
  await finished;
  src.stop();
  await audioCtx.close();

  onProgress({ stage: 'Done', value: 1 });
  const blob = new Blob(parts, { type: 'video/mp4' });
  if (!blob.size) throw new AppError('recorder_empty', 'The recorder produced an empty file.');
  return { blob, filename, mode: 'recorder', durationSeconds: duration };
}

function nextTick() {
  return new Promise((r) => setTimeout(r, 0));
}

function sanitize(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'reel'
  );
}

/**
 * Hands the file to the iOS share sheet so "Save Video" puts it in Photos.
 * Falls back to a download when sharing files is not available.
 */
export async function shareVideo(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'video/mp4' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'shared';
    }
  }
  download(blob, filename);
  return 'downloaded';
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lets the user grab just the voiceover, which is handy when debugging timing. */
export function downloadMixdown(mixdown: AudioBuffer, base: string) {
  download(bufferToWav(mixdown), `${sanitize(base)}-voiceover.wav`);
}
