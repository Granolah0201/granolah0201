import type { ReactNode } from 'react';
import { useStore, type Route } from '../store';
import { IconArchive, IconFilm, IconLayers, IconSearch } from './Icons';

const TABS: { route: Route; label: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { route: 'home', label: 'Make', icon: IconSearch },
  { route: 'editor', label: 'Edit', icon: IconFilm },
  { route: 'references', label: 'Styles', icon: IconLayers },
  { route: 'library', label: 'Library', icon: IconArchive },
];

export default function Shell({ children }: { children: ReactNode }) {
  const { route, navigate, project } = useStore();

  return (
    <div className="flex min-h-full flex-col bg-ink-950">
      <main className="flex-1 pb-28">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = route === tab.route || (tab.route === 'library' && route === 'settings');
            const disabled = tab.route === 'editor' && !project;
            return (
              <button
                key={tab.route}
                onClick={() => !disabled && navigate(tab.route)}
                disabled={disabled}
                className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition ${
                  active ? 'text-accent' : disabled ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 px-5 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-sm text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-lg px-5 py-5">{children}</div>;
}
