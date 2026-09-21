import { useState } from 'react';
import { proxied } from '../lib/api/worker';
import { retimeText } from '../lib/captions/timing';
import { estimateDuration } from '../lib/pipeline';
import type { Project, ResearchFact, Scene } from '../types';
import { IconImage, IconPlay, IconRefresh } from './Icons';

const ROLE_LABELS: Record<string, string> = {
  hook: 'Hook',
  fact: 'Fact',
  history: 'History',
  twist: 'Twist',
  cta: 'Closing',
};

interface Props {
  project: Project;
  scene: Scene;
  index: number;
  active: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<Scene>) => void;
  onSwapImage: () => void;
  onRegenerate: () => void;
  onRespeak: () => void;
  busyAction: 'line' | 'voice' | null;
}

export default function SceneCard({
  project,
  scene,
  index,
  active,
  onSelect,
  onPatch,
  onSwapImage,
  onRegenerate,
  onRespeak,
  busyAction,
}: Props) {
  const [draft, setDraft] = useState(scene.text);
  const [editing, setEditing] = useState(false);
  const fact: ResearchFact | undefined = project.research?.facts.find((f) => f.id === scene.factId);

  const commit = () => {
    setEditing(false);
    const text = draft.trim();
    if (!text || text === scene.text) {
      setDraft(scene.text);
      return;
    }
    const duration = estimateDuration(text, project.style);
    // The recorded voice no longer matches, so the line needs re-speaking.
    onPatch({ text, duration, words: retimeText(text, 0, duration), audioKey: undefined });
  };

  return (
    <article className={`card overflow-hidden transition ${active ? 'border-accent/70' : ''}`}>
      <div className="flex gap-3 p-3">
        <button
          onClick={onSelect}
          className="relative h-28 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-700 bg-ink-900"
        >
          {scene.asset ? (
            <img
              src={proxied(scene.asset.thumbUrl)}
              alt=""
              loading="lazy"
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-slate-600">
              <IconImage className="h-5 w-5" />
            </span>
          )}
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-slate-200">
            {index + 1}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="chip">{ROLE_LABELS[scene.role] || scene.role}</span>
            <span className="text-[11px] tabular-nums text-slate-500">{scene.duration.toFixed(1)}s</span>
            {!scene.audioKey && <span className="chip border-amber-500/40 text-amber-400">no voice</span>}
          </div>

          {editing ? (
            <textarea
              className="field min-h-[84px] text-sm leading-relaxed"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
            />
          ) : (
            <button
              className="w-full text-left text-sm leading-relaxed text-slate-100"
              onClick={() => {
                setDraft(scene.text);
                setEditing(true);
              }}
            >
              {scene.text}
            </button>
          )}

          {fact && (
            <p className="mt-2 border-l-2 border-ink-600 pl-2 text-[11px] leading-relaxed text-slate-500">
              <span className={fact.verified ? 'text-mint' : 'text-amber-400'}>
                {fact.verified ? 'Checked' : 'Unverified'}
              </span>
              {fact.sourceSection ? ` · ${fact.sourceSection}` : ''} ·{' '}
              <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                Wikipedia
              </a>
              <span className="mt-0.5 block italic text-slate-600">&ldquo;{fact.sourceQuote}&rdquo;</span>
            </p>
          )}

          {scene.asset && (
            <p className="mt-2 truncate text-[11px] text-slate-500">
              {scene.asset.credit.author} · {scene.asset.credit.source}
              {scene.asset.illustration ? ' · AI illustration' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-ink-700 text-xs">
        <button className="flex items-center justify-center gap-1.5 py-2.5 text-slate-300 active:bg-ink-700" onClick={onSwapImage}>
          <IconImage className="h-3.5 w-3.5" /> Image
        </button>
        <button
          className="flex items-center justify-center gap-1.5 border-x border-ink-700 py-2.5 text-slate-300 active:bg-ink-700 disabled:opacity-40"
          onClick={onRegenerate}
          disabled={busyAction === 'line'}
        >
          <IconRefresh className={`h-3.5 w-3.5 ${busyAction === 'line' ? 'animate-spin' : ''}`} /> Rewrite
        </button>
        <button
          className="flex items-center justify-center gap-1.5 py-2.5 text-slate-300 active:bg-ink-700 disabled:opacity-40"
          onClick={onRespeak}
          disabled={busyAction === 'voice'}
        >
          <IconPlay className={`h-3.5 w-3.5 ${busyAction === 'voice' ? 'animate-pulse' : ''}`} /> Speak
        </button>
      </div>
    </article>
  );
}
