import { useEffect, useState } from 'react';
import { proxied } from '../lib/api/worker';
import { optionsForScene } from '../lib/pipeline';
import { aiIllustration } from '../lib/visuals/search';
import { useStore } from '../store';
import type { Project, VisualAsset } from '../types';
import { IconRefresh, IconSearch } from './Icons';
import Sheet from './Sheet';

interface Props {
  open: boolean;
  project: Project;
  sceneIndex: number;
  onClose: () => void;
  onPick: (asset: VisualAsset) => void;
}

export default function ImageSheet({ open, project, sceneIndex, onClose, onPick }: Props) {
  const scene = project.scenes[sceneIndex];
  const setError = useStore((s) => s.setError);
  const [query, setQuery] = useState(scene?.visualQuery || '');
  const [results, setResults] = useState<VisualAsset[]>(scene?.alternatives || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery(scene?.visualQuery || '');
    setResults(scene?.alternatives?.length ? scene.alternatives : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sceneIndex]);

  const search = async (q?: string) => {
    setLoading(true);
    try {
      setResults(await optionsForScene(project, sceneIndex, q ?? query));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Swap the picture"
      onClose={onClose}
      footer={
        <button
          className="btn-ghost w-full"
          onClick={() => onPick(aiIllustration(`${project.research?.commonName || project.animal}, ${query}`))}
        >
          Use a labelled AI illustration instead
        </button>
      }
    >
      <div className="flex gap-2">
        <input
          className="field flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="axolotl close up underwater"
          enterKeyHint="search"
        />
        <button className="btn-quiet px-4" onClick={() => search()} disabled={loading}>
          {loading ? <IconRefresh className="h-4 w-4 animate-spin" /> : <IconSearch className="h-4 w-4" />}
        </button>
      </div>

      {!results.length && !loading && (
        <p className="mt-6 text-center text-sm text-slate-400">
          Nothing loaded yet. Search above to pull free pictures from Pexels, Pixabay and Wikimedia Commons.
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {results.map((asset) => (
          <button
            key={asset.id}
            onClick={() => onPick(asset)}
            className={`relative overflow-hidden rounded-xl border ${
              scene?.asset?.id === asset.id ? 'border-accent' : 'border-ink-700'
            }`}
            style={{ aspectRatio: '9 / 16' }}
          >
            <img
              src={proxied(asset.thumbUrl)}
              alt={asset.credit.author}
              loading="lazy"
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[9px] leading-tight text-slate-200">
              {asset.credit.source}
              {asset.illustration ? ' · art' : ''}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
