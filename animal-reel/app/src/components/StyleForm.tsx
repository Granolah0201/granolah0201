import { VOICES } from '../lib/voices';
import type { StyleProfile } from '../types';

type Patch = (patch: Partial<StyleProfile>) => void;

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="label mb-0">{label}</span>
        {children}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  return (
    <div className="flex w-1/2 items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 accent-accent"
      />
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-400">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-200"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`h-7 w-12 rounded-full p-0.5 transition ${value ? 'bg-accent' : 'bg-ink-600'}`}
      role="switch"
      aria-checked={value}
    >
      <span className={`block h-6 w-6 rounded-full bg-white transition ${value ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Colour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-14 cursor-pointer rounded-lg border border-ink-600 bg-ink-900"
    />
  );
}

/** Every knob of a Style Profile, shared by the editor and the references screen. */
export default function StyleForm({ style, onPatch }: { style: StyleProfile; onPatch: Patch }) {
  const caption = (patch: Partial<StyleProfile['captionStyle']>) =>
    onPatch({ captionStyle: { ...style.captionStyle, ...patch } });
  const editing = (patch: Partial<StyleProfile['editing']>) => onPatch({ editing: { ...style.editing, ...patch } });

  return (
    <div className="divide-y divide-ink-700">
      <section>
        <h3 className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-accent">Format</h3>
        <Row label="Length">
          <Slider
            value={style.format.targetSeconds}
            min={10}
            max={90}
            step={1}
            onChange={(n) => onPatch({ format: { ...style.format, targetSeconds: n } })}
            format={(n) => `${n}s`}
          />
        </Row>
        <Row label="Seconds per shot" hint="Used as a target when the script is written.">
          <Slider
            value={style.pacing.secondsPerShot}
            min={0.8}
            max={8}
            step={0.1}
            onChange={(n) => onPatch({ pacing: { ...style.pacing, secondsPerShot: n } })}
            format={(n) => `${n.toFixed(1)}s`}
          />
        </Row>
        <Row label="Hook">
          <Select
            value={style.hookStyle}
            options={['question', 'shocking-fact', 'you-wont-believe', 'story-open', 'countdown'] as const}
            onChange={(v) => onPatch({ hookStyle: v })}
          />
        </Row>
        <div className="py-2.5">
          <span className="label">Tone</span>
          <input
            className="field"
            value={style.format.tone}
            onChange={(e) => onPatch({ format: { ...style.format, tone: e.target.value } })}
          />
        </div>
      </section>

      <section>
        <h3 className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-accent">Captions</h3>
        <Row label="Font">
          <Select
            value={style.captionStyle.fontVibe}
            options={['bold-sans', 'rounded', 'condensed', 'serif', 'handwritten', 'mono'] as const}
            onChange={(v) => caption({ fontVibe: v })}
          />
        </Row>
        <Row label="Size">
          <Slider value={style.captionStyle.sizePct} min={3.5} max={12} step={0.1} onChange={(n) => caption({ sizePct: n })} format={(n) => `${n.toFixed(1)}%`} />
        </Row>
        <Row label="Position" hint="Distance from the top of the frame.">
          <Slider value={style.captionStyle.positionPct} min={12} max={90} step={1} onChange={(n) => caption({ positionPct: n })} format={(n) => `${n}%`} />
        </Row>
        <Row label="Case">
          <Select value={style.captionStyle.textCase} options={['upper', 'sentence', 'lower'] as const} onChange={(v) => caption({ textCase: v })} />
        </Row>
        <Row label="Words at once">
          <Slider value={style.captionStyle.wordsPerChunk} min={1} max={4} step={1} onChange={(n) => caption({ wordsPerChunk: n })} format={(n) => String(n)} />
        </Row>
        <Row label="Text colour">
          <Colour value={style.captionStyle.color} onChange={(v) => caption({ color: v })} />
        </Row>
        <Row label="Spoken word">
          <Colour value={style.captionStyle.highlightColor} onChange={(v) => caption({ highlightColor: v })} />
        </Row>
        <Row label="Outline">
          <Colour value={style.captionStyle.strokeColor} onChange={(v) => caption({ strokeColor: v })} />
        </Row>
        <Row label="Outline width">
          <Slider value={style.captionStyle.strokeWidthPct} min={0} max={14} step={0.5} onChange={(n) => caption({ strokeWidthPct: n })} format={(n) => `${n}%`} />
        </Row>
        <Row label="Shadow">
          <Toggle value={style.captionStyle.shadow} onChange={(v) => caption({ shadow: v })} />
        </Row>
        <Row label="Animation">
          <Select value={style.captionStyle.animation} options={['none', 'pop', 'fade', 'slide-up', 'bounce'] as const} onChange={(v) => caption({ animation: v })} />
        </Row>
        <Row label="Emoji">
          <Toggle value={style.captionStyle.emoji} onChange={(v) => caption({ emoji: v })} />
        </Row>
      </section>

      <section>
        <h3 className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-accent">Motion and look</h3>
        <Row label="Zoom">
          <Slider value={style.editing.zoomIntensity} min={0} max={1} step={0.05} onChange={(n) => editing({ zoomIntensity: n })} format={(n) => `${Math.round(n * 100)}%`} />
        </Row>
        <Row label="Transition">
          <Select value={style.editing.transition} options={['cut', 'fade', 'whip', 'zoom'] as const} onChange={(v) => editing({ transition: v })} />
        </Row>
        <Row label="Grade">
          <Select value={style.editing.grade} options={['neutral', 'warm', 'cool', 'dark', 'high-contrast', 'vintage'] as const} onChange={(v) => editing({ grade: v })} />
        </Row>
        <Row label="Title cards">
          <Toggle value={style.editing.textOverlays} onChange={(v) => editing({ textOverlays: v })} />
        </Row>
        <Row label="Progress bar">
          <Toggle value={style.editing.progressBar} onChange={(v) => editing({ progressBar: v })} />
        </Row>
      </section>

      <section>
        <h3 className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-accent">Voice</h3>
        <Row label="Voice">
          <Select
            value={style.voice.voiceId}
            options={VOICES.map((v) => v.id)}
            onChange={(v) => onPatch({ voice: { ...style.voice, voiceId: v } })}
          />
        </Row>
        <Row label="Speed">
          <Slider
            value={style.voice.speed}
            min={0.7}
            max={1.4}
            step={0.01}
            onChange={(n) => onPatch({ voice: { ...style.voice, speed: n } })}
            format={(n) => `${n.toFixed(2)}x`}
          />
        </Row>
      </section>
    </div>
  );
}
