import { getBlob } from '../db';
import { buildMixdown, type SceneAudio } from './mix';
import { wavToClip } from '../tts/kokoro';
import type { Project } from '../../types';

/**
 * Builds the full soundtrack for a project from the per-scene clips saved in
 * IndexedDB. Returns null when the voiceover has not been rendered yet.
 */
export async function buildProjectAudio(project: Project): Promise<AudioBuffer | null> {
  const scenesWithAudio = project.scenes.filter((s) => s.audioKey);
  if (!scenesWithAudio.length) return null;

  const ctx = new OfflineAudioContext(1, 1, 48000);
  const parts: SceneAudio[] = [];
  let at = 0;

  for (const scene of project.scenes) {
    const duration = Math.max(0.6, scene.duration || 2.5);
    if (scene.audioKey) {
      const blob = await getBlob(scene.audioKey);
      if (blob) {
        try {
          parts.push({ start: at, clip: await wavToClip(blob, ctx) });
        } catch {
          // A clip that will not decode just leaves silence under its scene.
        }
      }
    }
    at += duration;
  }

  if (!parts.length) return null;
  return buildMixdown(parts, at, project.musicId ? { id: project.musicId, gain: project.musicGain } : null);
}

/** A cache so scrubbing the preview does not re-mix on every seek. */
const cache = new Map<string, { signature: string; buffer: AudioBuffer }>();

export function audioSignature(project: Project): string {
  return [
    project.scenes.map((s) => `${s.audioKey || '-'}:${s.duration.toFixed(2)}`).join('|'),
    project.musicId || 'none',
    project.musicGain.toFixed(2),
  ].join('#');
}

export async function getProjectAudio(project: Project): Promise<AudioBuffer | null> {
  const signature = audioSignature(project);
  const hit = cache.get(project.id);
  if (hit && hit.signature === signature) return hit.buffer;

  const buffer = await buildProjectAudio(project);
  if (buffer) cache.set(project.id, { signature, buffer });
  else cache.delete(project.id);
  return buffer;
}

export function invalidateAudio(projectId: string) {
  cache.delete(projectId);
}
