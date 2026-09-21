import { useState } from 'react';
import { ErrorBanner } from '../components/Feedback';
import { IconCheck, IconWarn } from '../components/Icons';
import { Row, Select, Toggle } from '../components/StyleForm';
import { Header, Page } from '../components/Shell';
import { workerHealth } from '../lib/api/worker';
import { download } from '../lib/render/export';
import { runExportSelfTest, type SelfTestResult } from '../lib/render/selftest';
import { getSettings, saveSettings, type Settings as S } from '../lib/config';
import { useStore } from '../store';

export default function Settings() {
  const setError = useStore((s) => s.setError);
  const [settings, setSettings] = useState<S>(getSettings());
  const [health, setHealth] = useState<Awaited<ReturnType<typeof workerHealth>> | null>(null);
  const [checking, setChecking] = useState(false);
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);
  const setProgress = useStore((s) => s.setProgress);
  const run = useStore((s) => s.run);

  const patch = (p: Partial<S>) => setSettings(saveSettings(p));

  const check = async () => {
    setChecking(true);
    setHealth(null);
    setError(null);
    try {
      setHealth(await workerHealth());
    } catch (err) {
      setError(err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Header title="Settings" subtitle="Keys live on the Worker, never here" />
      <Page>
        <ErrorBanner />

        <div className="card p-4">
          <label className="label" htmlFor="worker">Worker URL</label>
          <input
            id="worker"
            className="field"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="https://animal-reel-worker.you.workers.dev"
            value={settings.workerUrl}
            onChange={(e) => patch({ workerUrl: e.target.value })}
          />

          <label className="label mt-4" htmlFor="token">App token</label>
          <input
            id="token"
            className="field"
            type="password"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Only if the Worker has APP_TOKEN set"
            value={settings.appToken}
            onChange={(e) => patch({ appToken: e.target.value })}
          />

          <button className="btn-ghost mt-4 w-full" onClick={check} disabled={!settings.workerUrl || checking}>
            {checking ? 'Checking…' : 'Check the connection'}
          </button>

          {health && (
            <div className="mt-4 space-y-1.5 rounded-xl border border-ink-700 bg-ink-900 p-3 text-sm">
              {(
                [
                  ['Gemini key', health.has.gemini],
                  ['Pexels key', health.has.pexels],
                  ['Pixabay key', health.has.pixabay],
                ] as const
              ).map(([label, ok]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-slate-400">{label}</span>
                  {ok ? <IconCheck className="h-4 w-4 text-mint" /> : <IconWarn className="h-4 w-4 text-amber-400" />}
                </div>
              ))}
              <p className="pt-1 text-xs text-slate-500">
                Script model {health.models.flash}, research model {health.models.flashLite}.
              </p>
            </div>
          )}
        </div>

        <div className="card mt-6 divide-y divide-ink-700 px-4">
          <Row label="Script on Flash" hint="Flash writes better scripts but the free tier allows about 20 calls a day. Turning this off keeps everything on Flash-Lite.">
            <Toggle value={settings.useFlashForScript} onChange={(v) => patch({ useFlashForScript: v })} />
          </Row>
          <Row label="Prefer Commons" hint="Search Wikimedia Commons before the stock photo sites. Useful once the Pexels hourly limit is hit.">
            <Toggle value={settings.preferCommons} onChange={(v) => patch({ preferCommons: v })} />
          </Row>
          <Row label="Voice quality" hint="q8 is the fastest on a phone. fp32 is a larger download and slower, with a slightly cleaner voice.">
            <Select value={settings.ttsDtype} options={['q4', 'q8', 'fp32'] as const} onChange={(v) => patch({ ttsDtype: v })} />
          </Row>
        </div>

        <section className="mt-6">
          <h2 className="label">Export self test</h2>
          <div className="card p-4">
            <p className="text-sm text-slate-400">
              Builds a three second reel from nothing and encodes it. Run this once on a new phone to find out whether
              the fast encoder works here before spending any quota.
            </p>
            <button
              className="btn-ghost mt-3 w-full"
              onClick={async () => {
                setSelfTest(null);
                const result = await run(() => runExportSelfTest(setProgress));
                if (result) setSelfTest(result);
              }}
            >
              Test the exporter
            </button>
            {selfTest && (
              <div className="mt-3 space-y-1 rounded-xl border border-ink-700 bg-ink-900 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Encoder</span>
                  <span>{selfTest.mode === 'webcodecs' ? 'WebCodecs (fast)' : 'MediaRecorder (real time)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">File size</span>
                  <span className="tabular-nums">{(selfTest.bytes / 1024).toFixed(0)} KB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Length</span>
                  <span className="tabular-nums">{selfTest.seconds.toFixed(1)}s, {selfTest.frames} frames</span>
                </div>
                <button
                  className="btn-quiet mt-2 w-full text-sm"
                  onClick={() => download(selfTest.blob, 'reelwild-self-test.mp4')}
                >
                  Save the test clip
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="label">Free-tier limits</h2>
          <div className="card space-y-2 p-4 text-sm text-slate-400">
            <p>Gemini: roughly 20 Flash calls a day and 500 on Flash-Lite. A reel costs two, plus one per rewritten line.</p>
            <p>Pexels: 200 searches an hour. Results are cached per query for a day, so regenerating costs nothing.</p>
            <p>The voice runs on this phone through Kokoro, so it has no limit and no cost.</p>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="label">Install</h2>
          <div className="card p-4 text-sm text-slate-400">
            In Safari, tap Share, then "Add to Home Screen". The app then opens full screen with no browser chrome.
          </div>
        </section>
      </Page>
    </>
  );
}
