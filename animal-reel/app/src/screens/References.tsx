import { useEffect, useRef, useState } from 'react';
import { Empty, ErrorBanner } from '../components/Feedback';
import { IconTrash, IconUpload } from '../components/Icons';
import { StyleSummary } from '../components/Pickers';
import { Header, Page } from '../components/Shell';
import Sheet from '../components/Sheet';
import StyleForm from '../components/StyleForm';
import { hasWorker } from '../lib/config';
import { getBlob } from '../lib/db';
import { extractStyle } from '../lib/pipeline';
import { useStore } from '../store';
import type { StyleProfile } from '../types';

export default function References() {
  const { run, setProgress, customPresets, addPreset, deletePreset, navigate } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<StyleProfile | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let revoked: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const p of customPresets) {
        const key = p.derivedFrom?.thumbnailId;
        if (!key) continue;
        const blob = await getBlob(key);
        if (blob) {
          const url = URL.createObjectURL(blob);
          next[p.id] = url;
          revoked.push(url);
        }
      }
      setThumbs(next);
    })();
    return () => revoked.forEach((u) => URL.revokeObjectURL(u));
  }, [customPresets]);

  const analyse = async () => {
    if (!files.length) return;
    const profile = await run(async () => {
      setProgress({ stage: 'Reading the reference', detail: 'Gemini Flash is watching the clip', value: null });
      return extractStyle(files, name, notes);
    });
    if (profile) setDraft(profile);
  };

  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1048576;

  return (
    <>
      <Header title="Styles" subtitle="Copy the feel of a reel you like" />
      <Page>
        <ErrorBanner />

        {!hasWorker() && (
          <button onClick={() => navigate('settings')} className="card mb-4 block w-full p-4 text-left">
            <p className="text-sm font-semibold text-accent">Connect your Worker first</p>
            <p className="mt-1 text-sm text-slate-400">Reading a reference runs through Gemini, which lives behind the Worker.</p>
          </button>
        )}

        <div className="card p-4">
          <h2 className="text-sm font-semibold">New reference</h2>
          <p className="mt-1 text-xs text-slate-500">
            Upload a reel or a few screenshots. Only the style is copied: pacing, captions, motion, colour and the kind
            of voice. The clips, audio and script of the reference are never reused.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />

          <button className="btn-ghost mt-4 w-full" onClick={() => fileRef.current?.click()}>
            <IconUpload className="h-4 w-4" />
            {files.length ? `${files.length} file${files.length > 1 ? 's' : ''} · ${totalMb.toFixed(1)}MB` : 'Choose a reel or screenshots'}
          </button>
          {totalMb > 90 && (
            <p className="mt-2 text-xs text-amber-400">That is over the 90MB limit. Trim the clip or use screenshots.</p>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="ref-name">Name</label>
              <input id="ref-name" className="field" placeholder="Creature facts style" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="ref-notes">Notes</label>
              <textarea
                id="ref-notes"
                className="field min-h-[72px]"
                placeholder="Match the pacing and captions"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <button className="btn-primary mt-4 w-full" onClick={analyse} disabled={!files.length || totalMb > 90 || !hasWorker()}>
            Read the style
          </button>
        </div>

        <section className="mt-8">
          <h2 className="label">Saved presets</h2>
          {!customPresets.length ? (
            <Empty title="No saved styles yet" body="Read a reference above, or save a tweaked style from the editor." />
          ) : (
            <div className="space-y-3">
              {customPresets.map((p) => (
                <article key={p.id} className="card p-4">
                  <div className="flex gap-3">
                    {thumbs[p.id] && (
                      <img src={thumbs[p.id]} alt="" className="h-20 w-12 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                        <button className="shrink-0 text-slate-500 hover:text-red-400" onClick={() => deletePreset(p.id)} aria-label="Delete">
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{p.summary}</p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-ink-700 pt-3">
                    <StyleSummary style={p} />
                  </div>
                  <button className="btn-quiet mt-3 w-full text-sm" onClick={() => setDraft(p)}>
                    Edit
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </Page>

      {draft && (
        <Sheet
          open
          title={draft.name || 'Style profile'}
          onClose={() => setDraft(null)}
          footer={
            <button
              className="btn-primary w-full"
              onClick={async () => {
                await addPreset(draft);
                setDraft(null);
                setFiles([]);
                setName('');
                setNotes('');
              }}
            >
              Save preset
            </button>
          }
        >
          {draft.summary && <p className="mb-3 text-sm text-slate-400">{draft.summary}</p>}
          <div>
            <label className="label" htmlFor="draft-name">Preset name</label>
            <input id="draft-name" className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <StyleForm style={draft} onPatch={(patch) => setDraft({ ...draft, ...patch })} />
        </Sheet>
      )}
    </>
  );
}
