import { create } from 'zustand';
import { listPresets, listProjects, saveProject as persistProject, savePreset as persistPreset, deletePreset as removePreset, deleteProject as removeProject } from './lib/db';
import { clonePreset } from './lib/styles/presets';
import { AppError, type Project, type ProgressUpdate, type Scene, type StyleProfile } from './types';

export type Route = 'home' | 'references' | 'editor' | 'library' | 'settings';

interface State {
  route: Route;
  navigate: (r: Route) => void;

  project: Project | null;
  setProject: (p: Project | null) => void;
  patchProject: (patch: Partial<Project>) => void;
  patchScene: (index: number, patch: Partial<Scene>) => void;
  saveCurrent: () => Promise<void>;

  projects: Project[];
  refreshProjects: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  customPresets: StyleProfile[];
  refreshPresets: () => Promise<void>;
  addPreset: (p: StyleProfile) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;

  busy: boolean;
  progress: ProgressUpdate | null;
  setProgress: (p: ProgressUpdate | null) => void;
  error: AppError | null;
  setError: (e: unknown) => void;
  run: <T>(fn: () => Promise<T>) => Promise<T | null>;
}

export const useStore = create<State>((set, get) => ({
  route: 'home',
  navigate: (route) => {
    set({ route });
    if (typeof location !== 'undefined') location.hash = `#/${route}`;
    window.scrollTo({ top: 0 });
  },

  project: null,
  setProject: (project) => set({ project }),
  patchProject: (patch) => {
    const project = get().project;
    if (!project) return;
    set({ project: { ...project, ...patch, updatedAt: Date.now() } });
  },
  patchScene: (index, patch) => {
    const project = get().project;
    if (!project) return;
    const scenes = project.scenes.map((s, i) => (i === index ? { ...s, ...patch } : s));
    set({ project: { ...project, scenes, updatedAt: Date.now() } });
  },
  saveCurrent: async () => {
    const project = get().project;
    if (project) {
      await persistProject(project);
      await get().refreshProjects();
    }
  },

  projects: [],
  refreshProjects: async () => set({ projects: await listProjects() }),
  openProject: async (id) => {
    const project = get().projects.find((p) => p.id === id) || (await listProjects()).find((p) => p.id === id);
    if (project) {
      set({ project });
      get().navigate('editor');
    }
  },
  deleteProject: async (id) => {
    await removeProject(id);
    if (get().project?.id === id) set({ project: null });
    await get().refreshProjects();
  },

  customPresets: [],
  refreshPresets: async () => set({ customPresets: await listPresets() }),
  addPreset: async (p) => {
    await persistPreset(clonePreset(p));
    await get().refreshPresets();
  },
  deletePreset: async (id) => {
    await removePreset(id);
    await get().refreshPresets();
  },

  busy: false,
  progress: null,
  setProgress: (progress) => set({ progress }),
  error: null,
  setError: (e) => {
    if (!e) return set({ error: null });
    if (e instanceof AppError) return set({ error: e });
    const message = e instanceof Error ? e.message : String(e);
    set({ error: new AppError('unexpected', message) });
  },

  /** Wraps a long task with the busy flag, the progress bar and error capture. */
  run: async (fn) => {
    set({ busy: true, error: null });
    try {
      return await fn();
    } catch (err) {
      get().setError(err);
      return null;
    } finally {
      set({ busy: false, progress: null });
    }
  },
}));

export function routeFromHash(): Route {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const allowed: Route[] = ['home', 'references', 'editor', 'library', 'settings'];
  return allowed.includes(raw as Route) ? (raw as Route) : 'home';
}
