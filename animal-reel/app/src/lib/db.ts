import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project, StyleProfile } from '../types';

interface ReelDB extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
  presets: { key: string; value: StyleProfile };
  blobs: { key: string; value: { key: string; blob: Blob; createdAt: number } };
  cache: { key: string; value: { key: string; value: unknown; expiresAt: number } };
}

let dbPromise: Promise<IDBPDatabase<ReelDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ReelDB>('reelwild', 1, {
      upgrade(d) {
        const projects = d.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('presets', { keyPath: 'id' });
        d.createObjectStore('blobs', { keyPath: 'key' });
        d.createObjectStore('cache', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

// ------------------------------------------------------------------ projects

export async function saveProject(p: Project) {
  (await db()).put('projects', p);
}

export async function getProject(id: string) {
  return (await db()).get('projects', id);
}

export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAllFromIndex('projects', 'updatedAt');
  return all.reverse();
}

export async function deleteProject(id: string) {
  const p = await getProject(id);
  if (p) {
    // Drop every blob this project owned so the phone does not fill up.
    const keys = [p.thumbnailKey, ...p.scenes.map((s) => s.audioKey), ...p.scenes.map((s) => s.asset?.blobKey)];
    await Promise.all(keys.filter(Boolean).map((k) => deleteBlob(k as string)));
  }
  await (await db()).delete('projects', id);
}

// ------------------------------------------------------------------- presets

export async function savePreset(p: StyleProfile) {
  (await db()).put('presets', p);
}

export async function listPresets(): Promise<StyleProfile[]> {
  const all = await (await db()).getAll('presets');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deletePreset(id: string) {
  await (await db()).delete('presets', id);
}

// --------------------------------------------------------------------- blobs

export async function putBlob(key: string, blob: Blob) {
  await (await db()).put('blobs', { key, blob, createdAt: Date.now() });
  return key;
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await (await db()).get('blobs', key))?.blob;
}

export async function deleteBlob(key: string) {
  await (await db()).delete('blobs', key);
}

// --------------------------------------------------------------------- cache

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const row = await (await db()).get('cache', key);
  if (!row) return undefined;
  if (row.expiresAt < Date.now()) {
    await (await db()).delete('cache', key);
    return undefined;
  }
  return row.value as T;
}

export async function cacheSet(key: string, value: unknown, ttlMs: number) {
  await (await db()).put('cache', { key, value, expiresAt: Date.now() + ttlMs });
}

/** Rough size of everything stored, for the Library screen. */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage: usage || 0, quota: quota || 0 };
}
