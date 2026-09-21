import { useStore } from '../store';
import { IconWarn, IconClose } from './Icons';

export function ProgressOverlay() {
  const { busy, progress } = useStore();
  if (!busy) return null;

  const pct = progress?.value == null ? null : Math.round(Math.max(0, Math.min(1, progress.value)) * 100);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/85 px-6 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
        <p className="text-base font-semibold">{progress?.stage || 'Working'}</p>
        {progress?.detail && <p className="mt-1 text-sm text-slate-400">{progress.detail}</p>}

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink-700">
          {pct == null ? (
            <div className="shimmer h-full w-full" />
          ) : (
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
          )}
        </div>
        {pct != null && <p className="mt-2 text-xs tabular-nums text-slate-500">{pct}%</p>}
      </div>
    </div>
  );
}

export function ErrorBanner() {
  const { error, setError } = useStore();
  if (!error) return null;

  return (
    <div className="mx-auto mb-4 max-w-lg">
      <div className="card border-red-500/40 bg-red-950/40 p-4">
        <div className="flex gap-3">
          <IconWarn className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-200">{error.message}</p>
            {error.hint && <p className="mt-1 text-sm text-red-200/70">{error.hint}</p>}
            {error.retryAfterSeconds != null && (
              <p className="mt-1 text-xs text-red-200/60">Try again in about {Math.ceil(error.retryAfterSeconds / 60)} minutes.</p>
            )}
            <p className="mt-2 text-[11px] uppercase tracking-wider text-red-300/50">{error.code}</p>
          </div>
          <button className="shrink-0 text-red-300/70" onClick={() => setError(null)} aria-label="Dismiss">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: JSX.Element }) {
  return (
    <div className="card p-8 text-center">
      <p className="text-base font-semibold text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
