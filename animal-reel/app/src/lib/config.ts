export interface Settings {
  /** Base URL of the Cloudflare Worker proxy, e.g. https://animal-reel-worker.you.workers.dev */
  workerUrl: string;
  /** Shared secret, only if the Worker has APP_TOKEN set. */
  appToken: string;
  /** Smaller is faster on a phone; fp32 sounds marginally better on a laptop. */
  ttsDtype: 'q8' | 'fp32' | 'q4';
  /** Spend the small Flash quota on the script, or stay on Flash-Lite all the way. */
  useFlashForScript: boolean;
  /** Skip Pexels and go straight to Wikimedia Commons (useful once the hourly cap hits). */
  preferCommons: boolean;
}

const KEY = 'reelwild.settings.v1';

const DEFAULTS: Settings = {
  workerUrl: (import.meta.env.VITE_WORKER_URL as string) || '',
  appToken: '',
  ttsDtype: 'q8',
  useFlashForScript: true,
  preferCommons: false,
};

let cached: Settings | null = null;

export function getSettings(): Settings {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  next.workerUrl = next.workerUrl.replace(/\/+$/, '');
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private browsing; settings just will not persist */
  }
  return next;
}

export function hasWorker(): boolean {
  return !!getSettings().workerUrl;
}
