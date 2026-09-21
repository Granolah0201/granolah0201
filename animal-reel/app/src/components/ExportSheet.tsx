import { useEffect, useState } from 'react';
import { getProjectAudio } from '../lib/audio/preview';
import { MUSIC_TRACKS } from '../lib/audio/music';
import { detectCapabilities, downloadMixdown, exportReel, shareVideo, type Capabilities } from '../lib/render/export';
import { ReelRenderer } from '../lib/render/renderer';
import { creditLines } from '../lib/visuals/search';
import { useStore } from '../store';
import { AppError, type Project } from '../types';
import { IconCheck, IconCopy, IconShare, IconWarn } from './Icons';
import Sheet from './Sheet';

export default function ExportSheet({ open, project, onClose }: { open: boolean; project: Project; onClose: () => void }) {
  const { run, setProgress, patchProject, saveCurrent } = useStore();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [done, setDone] = useState<{ mode: string; how: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) void detectCapabilities().then(setCaps);
  }, [open]);

  const credits = creditLines(project.scenes.map((s) => s.asset).filter(Boolean) as never[]);
  const captionBlock = [
    project.caption,
    '',
    project.hashtags.join(' '),
    '',
    'Credits:',
    ...credits.map((c) => `- ${c}`),
    ...(project.research?.sources.map((s) => `- ${s.title} - ${s.url}`) || []),
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  const doExport = async () => {
    setDone(null);
    await run(async () => {
      setProgress({ stage: 'Preparing the frames', value: 0.02 });
      const renderer = await ReelRenderer.create(project);
      const audio = await getProjectAudio(project);
      if (!audio) {
        throw new AppError(
          'no_voiceover',
          'Render the voiceover before exporting.',
          'Tap "Render the voiceover" in the editor. The captions take their timing from it.',
        );
      }
      const result = await exportReel(renderer, audio, `${project.animal}-reel`, setProgress);
      const how = await shareVideo(result.blob, result.filename, project.title);
      setDone({ mode: result.mode, how });
    });
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(captionBlock);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const hasVoice = project.scenes.some((s) => s.audioKey);

  return (
    <Sheet
      open={open}
      title="Export"
      onClose={onClose}
      footer={
        <button className="btn-primary w-full py-3.5" onClick={doExport} disabled={!hasVoice || caps?.mode === 'none'}>
          <IconShare className="h-4 w-4" />
          {caps?.mode === 'recorder' ? 'Record and save' : 'Export MP4'}
        </button>
      }
    >
      {!hasVoice && (
        <div className="card mb-4 border-amber-500/40 bg-amber-950/30 p-3">
          <p className="flex gap-2 text-sm text-amber-200">
            <IconWarn className="h-4 w-4 shrink-0" />
            Render the voiceover first. Without it the captions have no timing to follow.
          </p>
        </div>
      )}

      {caps && (
        <div className="card mb-4 p-3 text-sm">
          <p className="font-medium text-slate-200">{caps.reason}</p>
          {caps.mode === 'recorder' && (
            <p className="mt-1 text-xs text-slate-400">
              Real-time recording takes as long as the reel itself. Keep the screen on and the app in front.
            </p>
          )}
          {caps.mode === 'none' && (
            <p className="mt-1 text-xs text-red-300">
              Neither WebCodecs nor an MP4 recorder is available here. Open the app in Safari on iOS 17 or later.
            </p>
          )}
        </div>
      )}

      <section className="mb-4">
        <h3 className="label">Music</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => patchProject({ musicId: null })}
            className={`rounded-xl border p-3 text-left text-sm ${
              project.musicId === null ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-800'
            }`}
          >
            None
            <span className="mt-0.5 block text-xs text-slate-400">Voice only</span>
          </button>
          {MUSIC_TRACKS.map((t) => (
            <button
              key={t.id}
              onClick={() => patchProject({ musicId: t.id })}
              className={`rounded-xl border p-3 text-left text-sm ${
                project.musicId === t.id ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-800'
              }`}
            >
              {t.name}
              <span className="mt-0.5 block text-xs text-slate-400">{t.mood}</span>
            </button>
          ))}
        </div>
        {project.musicId && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Music level</span>
              <span className="text-xs tabular-nums text-slate-400">{Math.round(project.musicGain * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.6}
              step={0.01}
              value={project.musicGain}
              onChange={(e) => patchProject({ musicGain: Number(e.target.value) })}
              onMouseUp={() => saveCurrent()}
              onTouchEnd={() => saveCurrent()}
              className="mt-2 h-2 w-full accent-accent"
            />
            <p className="mt-1 text-xs text-slate-500">The bed ducks automatically whenever the voice is speaking.</p>
          </div>
        )}
      </section>

      {done && (
        <div className="card mb-4 border-mint/40 bg-mint/5 p-3">
          <p className="flex gap-2 text-sm text-mint">
            <IconCheck className="h-4 w-4 shrink-0" />
            {done.how === 'shared'
              ? 'Sent to the share sheet. Choose "Save Video" to put it in Photos.'
              : 'Saved to your downloads.'}
          </p>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label mb-0">Caption and credits</h3>
          <button className="btn-quiet px-3 py-1.5 text-xs" onClick={copyCaption}>
            {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-ink-700 bg-ink-900 p-3 text-xs leading-relaxed text-slate-300">
{captionBlock}
        </pre>
        <p className="mt-2 text-xs text-slate-500">
          Pexels asks for credit and CC BY requires it, so paste this block with the post.
        </p>
      </section>

      <button
        className="btn-ghost mt-4 w-full text-sm"
        onClick={async () => {
          const audio = await getProjectAudio(project);
          if (audio) downloadMixdown(audio, project.animal);
        }}
      >
        Download the voiceover on its own
      </button>
    </Sheet>
  );
}
