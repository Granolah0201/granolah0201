import { useState } from 'react';
import { useStore } from '../store';
import type { Project, StyleProfile } from '../types';
import Sheet from './Sheet';
import StyleForm from './StyleForm';

/**
 * Tweaks the style of the open project. Caption and motion changes show up in
 * the preview at once; length and tone only matter on the next generate.
 */
export default function StyleSheet({ open, project, onClose }: { open: boolean; project: Project; onClose: () => void }) {
  const { patchProject, saveCurrent, addPreset } = useStore();
  const [name, setName] = useState(`${project.style.name} (edited)`);
  const [saved, setSaved] = useState(false);

  const patch = (p: Partial<StyleProfile>) => patchProject({ style: { ...project.style, ...p } });

  return (
    <Sheet
      open={open}
      title="Style"
      onClose={() => {
        void saveCurrent();
        onClose();
      }}
      footer={
        <div className="flex gap-2">
          <input className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" />
          <button
            className="btn-primary px-4"
            onClick={async () => {
              await addPreset({
                ...project.style,
                id: `custom-${Date.now().toString(36)}`,
                name: name.trim() || 'Custom style',
                builtIn: false,
                createdAt: Date.now(),
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 1800);
            }}
          >
            {saved ? 'Saved' : 'Save preset'}
          </button>
        </div>
      }
    >
      <p className="mb-2 text-xs text-slate-500">
        Captions, motion and grade update the preview straight away. Length, tone and hook apply the next time you
        generate a script.
      </p>
      <StyleForm style={project.style} onPatch={patch} />
    </Sheet>
  );
}
