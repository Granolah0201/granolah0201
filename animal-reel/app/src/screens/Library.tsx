import { useEffect, useState } from 'react';
import { Empty } from '../components/Feedback';
import { IconGear, IconTrash } from '../components/Icons';
import { Header, Page } from '../components/Shell';
import { storageEstimate } from '../lib/db';
import { useStore } from '../store';

export default function Library() {
  const { projects, refreshProjects, openProject, deleteProject, navigate, customPresets } = useStore();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void refreshProjects();
    void storageEstimate().then(setStorage);
  }, [refreshProjects]);

  return (
    <>
      <Header
        title="Library"
        subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'} on this phone`}
        action={
          <button className="btn-quiet px-3 py-2 text-sm" onClick={() => navigate('settings')}>
            <IconGear className="h-4 w-4" />
          </button>
        }
      />
      <Page>
        {!projects.length ? (
          <Empty
            title="Nothing saved yet"
            body="Reels you generate are kept on this phone in IndexedDB. Nothing is uploaded and nothing costs anything."
            action={
              <button className="btn-primary" onClick={() => navigate('home')}>
                Make your first reel
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {projects.map((p) => {
              const seconds = p.scenes.reduce((n, s) => n + s.duration, 0);
              const voiced = p.scenes.filter((s) => s.audioKey).length;
              return (
                <article key={p.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => openProject(p.id)}>
                      <h3 className="truncate text-sm font-semibold">{p.title || p.animal}</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {p.style.name} · {p.scenes.length} scenes · {seconds.toFixed(0)}s
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {voiced === p.scenes.length ? 'Voiceover ready' : `${voiced} of ${p.scenes.length} lines voiced`} ·{' '}
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </p>
                    </button>
                    <button
                      className="shrink-0 rounded-lg p-2 text-slate-500 hover:text-red-400"
                      onClick={() => deleteProject(p.id)}
                      aria-label={`Delete ${p.title}`}
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="mt-8">
          <h2 className="label">On this device</h2>
          <div className="card space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Saved styles</span>
              <span className="tabular-nums">{customPresets.length}</span>
            </div>
            {storage && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-400">Storage used</span>
                  <span className="tabular-nums">
                    {(storage.usage / 1048576).toFixed(0)}MB of {(storage.quota / 1073741824).toFixed(1)}GB
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full rounded-full bg-mint"
                    style={{ width: `${Math.min(100, (storage.usage / Math.max(1, storage.quota)) * 100)}%` }}
                  />
                </div>
              </>
            )}
            <p className="pt-1 text-xs text-slate-500">
              Pictures, voice clips and the voice model are all cached locally. Deleting a project frees its media.
            </p>
          </div>
        </section>
      </Page>
    </>
  );
}
