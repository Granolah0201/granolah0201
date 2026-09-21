import { useEffect, useMemo, useState } from 'react';
import { ErrorBanner } from '../components/Feedback';
import { IconSparkles } from '../components/Icons';
import { StylePicker, VoicePicker } from '../components/Pickers';
import { Header, Page } from '../components/Shell';
import { hasWorker } from '../lib/config';
import { attachVisuals, generateScript } from '../lib/pipeline';
import { presetById } from '../lib/styles/presets';
import { DEFAULT_VOICE, voiceById } from '../lib/voices';
import { useStore } from '../store';
import type { DetectMode } from '../types';

const MODES: { id: DetectMode; label: string }[] = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'alive', label: 'Alive' },
  { id: 'extinct', label: 'Extinct' },
];

const SUGGESTIONS = ['Axolotl', 'Tardigrade', 'Dunkleosteus', 'Pistol shrimp', 'Thylacine', 'Mantis shrimp'];

export default function Home() {
  const { run, setProgress, setProject, saveCurrent, navigate, customPresets } = useStore();
  const [animal, setAnimal] = useState('');
  const [mode, setMode] = useState<DetectMode>('auto');
  const [presetId, setPresetId] = useState('fast-facts');
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE);
  const [speed, setSpeed] = useState(voiceById(DEFAULT_VOICE).speed);
  const [showVoice, setShowVoice] = useState(false);

  // Picking a preset moves the voice with it, unless the user already chose one.
  const [voiceTouched, setVoiceTouched] = useState(false);
  useEffect(() => {
    if (voiceTouched) return;
    const preset = presetById(presetId, customPresets);
    setVoiceId(preset.voice.voiceId);
    setSpeed(preset.voice.speed);
  }, [presetId, customPresets, voiceTouched]);

  const configured = hasWorker();
  const selected = useMemo(() => presetById(presetId, customPresets), [presetId, customPresets]);

  const generate = async () => {
    const name = animal.trim();
    if (!name) return;
    const style = presetById(presetId, customPresets);

    const project = await run(async () => {
      const draft = await generateScript(
        { animal: name, mode, style: { ...style, voice: { voiceId, speed } }, voiceId, voiceSpeed: speed },
        setProgress,
      );
      await attachVisuals(draft, setProgress);
      return draft;
    });

    if (project) {
      setProject(project);
      await saveCurrent();
      navigate('editor');
    }
  };

  return (
    <>
      <Header title="Reelwild" subtitle="Type an animal, get a reel" />
      <Page>
        <ErrorBanner />

        {!configured && (
          <button onClick={() => navigate('settings')} className="card mb-4 block w-full p-4 text-left">
            <p className="text-sm font-semibold text-accent">Connect your Worker first</p>
            <p className="mt-1 text-sm text-slate-400">
              The app needs the URL of your Cloudflare Worker. It holds the Gemini and stock photo keys so they never
              reach the phone. Tap to set it up.
            </p>
          </button>
        )}

        <div className="card p-4">
          <label className="label" htmlFor="animal">
            Which animal?
          </label>
          <input
            id="animal"
            className="field text-lg"
            placeholder="axolotl"
            value={animal}
            autoCapitalize="words"
            autoCorrect="off"
            enterKeyHint="go"
            onChange={(e) => setAnimal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
          />

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip shrink-0 hover:border-accent" onClick={() => setAnimal(s)}>
                {s}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-ink-900 p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-lg py-2 text-sm font-medium transition ${
                  mode === m.id ? 'bg-ink-700 text-slate-100' : 'text-slate-400'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-6">
          <h2 className="label">Style</h2>
          <StylePicker value={presetId} onChange={setPresetId} />
          <p className="mt-2 text-xs text-slate-500">
            {selected.format.tone}
          </p>
        </section>

        <section className="mt-6">
          <button className="flex w-full items-center justify-between" onClick={() => setShowVoice((v) => !v)}>
            <h2 className="label mb-0">Voice</h2>
            <span className="text-sm text-slate-400">
              {voiceById(voiceId).label} · {speed.toFixed(2)}x {showVoice ? '▴' : '▾'}
            </span>
          </button>
          {showVoice && (
            <div className="mt-3">
              <VoicePicker
                value={voiceId}
                speed={speed}
                onChange={(id) => {
                  setVoiceTouched(true);
                  setVoiceId(id);
                  setSpeed(voiceById(id).speed);
                }}
                onSpeed={(n) => {
                  setVoiceTouched(true);
                  setSpeed(n);
                }}
              />
            </div>
          )}
        </section>

        <button className="btn-primary mt-8 w-full py-4 text-base" onClick={generate} disabled={!animal.trim() || !configured}>
          <IconSparkles className="h-5 w-5" />
          Generate
        </button>

        <p className="mt-3 text-center text-xs text-slate-500">
          Two Gemini calls per reel. The voice runs on the phone, so it costs nothing.
        </p>
      </Page>
    </>
  );
}
