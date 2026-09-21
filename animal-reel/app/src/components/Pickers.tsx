import { useMemo, useState } from 'react';
import { clipToWav, speak } from '../lib/tts/kokoro';
import { BUILT_IN_PRESETS } from '../lib/styles/presets';
import { VOICES, voiceById } from '../lib/voices';
import { useStore } from '../store';
import type { StyleProfile } from '../types';
import { IconCheck, IconPlay } from './Icons';

export function StylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  // Selecting the raw slice and composing here keeps the snapshot stable; a
  // selector that builds a new array on every read makes React re-render forever.
  const customPresets = useStore((s) => s.customPresets);
  const presets = useMemo(() => [...customPresets, ...BUILT_IN_PRESETS], [customPresets]);

  return (
    <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`w-44 shrink-0 snap-start rounded-2xl border p-4 text-left transition ${
            value === p.id ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{p.name}</span>
            {value === p.id && <IconCheck className="h-4 w-4 text-accent" />}
          </div>
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-400">{p.summary}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="chip">{p.format.targetSeconds}s</span>
            <span className="chip">{p.pacing.secondsPerShot}s cuts</span>
            {!p.builtIn && <span className="chip border-mint/40 text-mint">yours</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

export function VoicePicker({
  value,
  speed,
  onChange,
  onSpeed,
}: {
  value: string;
  speed: number;
  onChange: (id: string) => void;
  onSpeed: (n: number) => void;
}) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const setProgress = useStore((s) => s.setProgress);

  const preview = async (id: string) => {
    setPreviewing(id);
    setNote('');
    try {
      const clip = await speak('This animal breaks every rule you thought you knew.', id, speed, (p) =>
        setNote(p.detail || p.stage),
      );
      const audio = new Audio(URL.createObjectURL(clipToWav(clip)));
      await audio.play();
      setNote('');
    } catch {
      setNote('The voice model could not load. Check the connection and try again.');
    } finally {
      setProgress(null);
      setPreviewing(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {VOICES.map((v) => (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className={`rounded-xl border p-3 text-left transition ${
              value === v.id ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{v.label}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  void preview(v.id);
                }}
                onKeyDown={(e) => e.key === 'Enter' && preview(v.id)}
                className="rounded-full p-1.5 text-slate-400 hover:text-accent"
                aria-label={`Preview ${v.label}`}
              >
                {previewing === v.id ? (
                  <span className="block h-3.5 w-3.5 animate-spin rounded-full border border-ink-500 border-t-accent" />
                ) : (
                  <IconPlay className="h-3.5 w-3.5" />
                )}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{v.vibe}</p>
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="label mb-0">Speed</span>
          <span className="text-xs tabular-nums text-slate-400">{speed.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          min={0.7}
          max={1.4}
          step={0.01}
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          className="mt-2 h-2 w-full accent-accent"
        />
      </div>

      {note && <p className="text-xs text-slate-400">{note}</p>}
      <p className="text-xs text-slate-500">
        Previewing downloads the voice model once. It is a few hundred megabytes and is cached afterwards.
      </p>
    </div>
  );
}

export function StyleSummary({ style }: { style: StyleProfile }) {
  const voice = voiceById(style.voice.voiceId);
  const rows: [string, string][] = [
    ['Length', `${style.format.targetSeconds}s`],
    ['Cuts', `${style.pacing.secondsPerShot}s per shot`],
    ['Captions', `${style.captionStyle.wordsPerChunk} word${style.captionStyle.wordsPerChunk > 1 ? 's' : ''}, ${style.captionStyle.textCase}`],
    ['Motion', `zoom ${Math.round(style.editing.zoomIntensity * 100)}%, ${style.editing.transition}`],
    ['Grade', style.editing.grade],
    ['Voice', `${voice.label} at ${style.voice.speed.toFixed(2)}x`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
          <dd className="text-slate-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
