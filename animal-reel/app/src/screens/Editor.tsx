import { useMemo, useState } from 'react';
import ExportSheet from '../components/ExportSheet';
import { Empty, ErrorBanner } from '../components/Feedback';
import { IconShare, IconSparkles } from '../components/Icons';
import ImageSheet from '../components/ImageSheet';
import Preview from '../components/Preview';
import SceneCard from '../components/SceneCard';
import { Header, Page } from '../components/Shell';
import StyleSheet from '../components/StyleSheet';
import { invalidateAudio } from '../lib/audio/preview';
import { regenerateLine, renderSceneVoice, renderVoice } from '../lib/pipeline';
import { useStore } from '../store';

export default function Editor() {
  const { project, setProject, patchScene, saveCurrent, run, setProgress, navigate, setError } = useStore();
  const [activeScene, setActiveScene] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [imageFor, setImageFor] = useState<number | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const [busyScene, setBusyScene] = useState<{ index: number; kind: 'line' | 'voice' } | null>(null);

  const missingVoice = useMemo(() => project?.scenes.filter((s) => !s.audioKey).length ?? 0, [project]);
  const totalSeconds = useMemo(() => project?.scenes.reduce((n, s) => n + s.duration, 0) ?? 0, [project]);

  if (!project) {
    return (
      <>
        <Header title="Editor" />
        <Page>
          <Empty
            title="Nothing open"
            body="Generate a reel from the Make tab, or open a saved one from the Library."
            action={
              <button className="btn-primary" onClick={() => navigate('home')}>
                Make one
              </button>
            }
          />
        </Page>
      </>
    );
  }

  const speakAll = async (onlyMissing: boolean) => {
    const updated = await run(async () => {
      const next = { ...project, scenes: project.scenes.map((s) => ({ ...s })) };
      await renderVoice(next, setProgress, onlyMissing);
      return next;
    });
    if (updated) {
      invalidateAudio(updated.id);
      setProject(updated);
      await saveCurrent();
    }
  };

  const speakOne = async (index: number) => {
    setBusyScene({ index, kind: 'voice' });
    try {
      const next = { ...project, scenes: project.scenes.map((s) => ({ ...s })) };
      await renderSceneVoice(next, index, setProgress);
      invalidateAudio(next.id);
      setProject(next);
      await saveCurrent();
    } catch (err) {
      setError(err);
    } finally {
      setBusyScene(null);
      setProgress(null);
    }
  };

  const rewrite = async (index: number) => {
    setBusyScene({ index, kind: 'line' });
    try {
      const scene = await regenerateLine(project, index);
      patchScene(index, scene);
      invalidateAudio(project.id);
      await saveCurrent();
    } catch (err) {
      setError(err);
    } finally {
      setBusyScene(null);
    }
  };

  const jumpToScene = (index: number) => {
    setActiveScene(index);
    const start = project.scenes.slice(0, index).reduce((n, s) => n + s.duration, 0);
    setSeekTo(start + 0.01);
  };

  return (
    <>
      <Header
        title={project.title || project.animal}
        subtitle={`${project.scenes.length} scenes · ${totalSeconds.toFixed(1)}s · ${project.style.name}`}
        action={
          <button className="btn-primary px-3 py-2 text-sm" onClick={() => setShowExport(true)}>
            <IconShare className="h-4 w-4" />
            Export
          </button>
        }
      />

      <Page>
        <ErrorBanner />

        <Preview project={project} seekTo={seekTo} onSceneChange={setActiveScene} />

        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1 text-sm" onClick={() => setShowStyle(true)}>
            Style
          </button>
          <button className="btn-primary flex-[2] text-sm" onClick={() => speakAll(missingVoice > 0)}>
            <IconSparkles className="h-4 w-4" />
            {missingVoice === project.scenes.length
              ? 'Render the voiceover'
              : missingVoice > 0
                ? `Speak ${missingVoice} changed line${missingVoice > 1 ? 's' : ''}`
                : 'Re-render the voiceover'}
          </button>
        </div>

        {missingVoice > 0 && (
          <p className="mt-2 text-center text-xs text-slate-500">
            The voice model runs on the phone. The first run downloads it once, then it is cached.
          </p>
        )}

        <section className="mt-6 space-y-3">
          <h2 className="label">Scenes</h2>
          {project.scenes.map((scene, i) => (
            <SceneCard
              key={scene.id}
              project={project}
              scene={scene}
              index={i}
              active={activeScene === i}
              onSelect={() => jumpToScene(i)}
              onPatch={(patch) => {
                patchScene(i, patch);
                invalidateAudio(project.id);
                void saveCurrent();
              }}
              onSwapImage={() => setImageFor(i)}
              onRegenerate={() => rewrite(i)}
              onRespeak={() => speakOne(i)}
              busyAction={busyScene?.index === i ? busyScene.kind : null}
            />
          ))}
        </section>

        {project.research && (
          <section className="mt-6">
            <h2 className="label">Sources</h2>
            <div className="card space-y-1 p-4 text-sm">
              {project.research.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block truncate text-slate-300 underline decoration-dotted">
                  {s.title}
                </a>
              ))}
              {project.research.facts.some((f) => !f.verified) && (
                <p className="pt-2 text-xs text-amber-400">
                  Some facts could not be matched back to the article text. They were kept out of the script.
                </p>
              )}
            </div>
          </section>
        )}
      </Page>

      {imageFor !== null && (
        <ImageSheet
          open
          project={project}
          sceneIndex={imageFor}
          onClose={() => setImageFor(null)}
          onPick={(asset) => {
            patchScene(imageFor, { asset });
            void saveCurrent();
            setImageFor(null);
          }}
        />
      )}

      <ExportSheet open={showExport} project={project} onClose={() => setShowExport(false)} />
      <StyleSheet open={showStyle} project={project} onClose={() => setShowStyle(false)} />
    </>
  );
}
