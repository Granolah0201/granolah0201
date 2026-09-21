import { useCallback, useEffect, useRef, useState } from 'react';
import { getProjectAudio } from '../lib/audio/preview';
import { FRAME_H, FRAME_W, ReelRenderer } from '../lib/render/renderer';
import type { Project } from '../types';
import { IconPause, IconPlay } from './Icons';

interface Props {
  project: Project;
  /** Jump the playhead here when it changes, e.g. after tapping a scene. */
  seekTo?: number | null;
  onSceneChange?: (index: number) => void;
}

/**
 * The live 9:16 preview. It draws through the same renderer the exporter uses,
 * so what plays here is what ends up in the MP4.
 */
export default function Preview({ project, seekTo, onSceneChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ReelRenderer | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode | null; buffer: AudioBuffer | null }>({
    ctx: null as unknown as AudioContext,
    source: null,
    buffer: null,
  });
  const rafRef = useRef(0);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadNote, setLoadNote] = useState('Loading pictures');
  const [hasAudio, setHasAudio] = useState(false);

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    renderer.drawFrame(ctx, t);
  }, []);

  // Rebuild the renderer whenever the cut changes.
  const signature = project.scenes
    .map((s) => `${s.id}:${s.asset?.id || '-'}:${s.duration.toFixed(2)}:${s.words.length}:${s.text.length}`)
    .join('|');
  const styleSignature = JSON.stringify(project.style.captionStyle) + JSON.stringify(project.style.editing);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      setLoadNote('Loading pictures');
      const renderer = await ReelRenderer.create(project, (i) =>
        setLoadNote(`Loading picture ${i + 1} of ${project.scenes.length}`),
      );
      if (cancelled) return;
      rendererRef.current = renderer;
      setDuration(renderer.duration);
      setReady(true);
      draw(Math.min(offsetRef.current, renderer.duration));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, styleSignature, project.research?.era]);

  // Keep the soundtrack in step with the edit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const buffer = await getProjectAudio(project);
      if (cancelled) return;
      audioRef.current.buffer = buffer;
      setHasAudio(!!buffer);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, project.musicId, project.musicGain]);

  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a.source) {
      try {
        a.source.stop();
      } catch {
        /* already stopped */
      }
      a.source.disconnect();
      a.source = null;
    }
  }, []);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopAudio();
    setPlaying(false);
  }, [stopAudio]);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(duration || 0, t));
      offsetRef.current = clamped;
      setTime(clamped);
      draw(clamped);
      if (playing) {
        stopAudio();
        startPlayback(clamped);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duration, playing, draw],
  );

  const startPlayback = useCallback(
    (from: number) => {
      const a = audioRef.current;
      if (!a.ctx) a.ctx = new AudioContext();
      // Safari starts every context suspended until a gesture resumes it.
      void a.ctx.resume();

      if (a.buffer) {
        const src = a.ctx.createBufferSource();
        src.buffer = a.buffer;
        src.connect(a.ctx.destination);
        src.start(0, Math.min(from, a.buffer.duration));
        a.source = src;
      }

      startedAtRef.current = performance.now() / 1000 - from;
      const tick = () => {
        const t = performance.now() / 1000 - startedAtRef.current;
        if (t >= (rendererRef.current?.duration || 0)) {
          draw(rendererRef.current?.duration || 0);
          setTime(rendererRef.current?.duration || 0);
          offsetRef.current = 0;
          pause();
          return;
        }
        draw(t);
        setTime(t);
        offsetRef.current = t;
        onSceneChange?.(rendererRef.current?.sceneIndexAt(t) ?? 0);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setPlaying(true);
    },
    [draw, onSceneChange, pause],
  );

  useEffect(() => {
    if (seekTo == null) return;
    seek(seekTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      stopAudio();
      void audioRef.current.ctx?.close();
    },
    [stopAudio],
  );

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full overflow-hidden rounded-2xl border border-ink-700 bg-black" style={{ aspectRatio: '9 / 16' }}>
        <canvas ref={canvasRef} width={FRAME_W} height={FRAME_H} className="h-full w-full" />

        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-950/80">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
            <p className="text-sm text-slate-400">{loadNote}</p>
          </div>
        )}

        {ready && (
          <button
            onClick={() => (playing ? pause() : startPlayback(offsetRef.current))}
            className="absolute inset-0 flex items-center justify-center"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {!playing && (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur">
                <IconPlay className="ml-1 h-7 w-7 text-white" />
              </span>
            )}
          </button>
        )}

        {!hasAudio && ready && (
          <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-slate-300">
            No voiceover yet
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-quiet px-3 py-2" onClick={() => (playing ? pause() : startPlayback(offsetRef.current))}>
          {playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, duration)}
          step={0.05}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-2 flex-1 accent-accent"
        />
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">
          {time.toFixed(1)} / {duration.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
