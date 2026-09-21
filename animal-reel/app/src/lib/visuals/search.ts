import { imageSearch } from '../api/worker';
import { cacheGet, cacheSet } from '../db';
import { getSettings } from '../config';
import { searchCommons } from './commons';
import { AppError, type VisualAsset } from '../../types';

const DAY = 24 * 60 * 60 * 1000;

export interface SearchOptions {
  /** Appended to the query, from the preset's visualBias. */
  bias?: string;
  /** Extinct subjects skip stock photo sites, which have nothing useful. */
  preferCommons?: boolean;
  limit?: number;
}

/**
 * Searches free sources in order and returns portrait-first results.
 * Every result is cached per query for a day so a re-generate costs no quota.
 */
export async function searchVisuals(query: string, opts: SearchOptions = {}): Promise<VisualAsset[]> {
  const q = [query, opts.bias].filter(Boolean).join(' ').trim();
  const cacheKey = `visuals.${opts.preferCommons ? 'c' : 's'}.${q.toLowerCase()}`;
  const hit = await cacheGet<VisualAsset[]>(cacheKey);
  if (hit?.length) return hit;

  const settings = getSettings();
  const commonsFirst = opts.preferCommons || settings.preferCommons;
  const limit = opts.limit ?? 12;
  const found: VisualAsset[] = [];
  const problems: AppError[] = [];

  // Pexels allows 200 searches an hour, so only fall through to a second
  // provider when the first did not return enough to cut between.
  const enough = Math.min(limit, 6);
  const runStock = async () => {
    for (const provider of ['pexels', 'pixabay'] as const) {
      if (found.length >= enough) return;
      try {
        const { assets } = await imageSearch(q, provider, limit);
        found.push(...assets.map(normalizeStock));
      } catch (err) {
        if (err instanceof AppError) problems.push(err);
      }
    }
  };

  const runCommons = async () => {
    if (found.length >= enough) return;
    try {
      found.push(...(await searchCommons(q, limit)));
    } catch {
      /* Commons is best-effort */
    }
  };

  if (commonsFirst) {
    await runCommons();
    await runStock();
  } else {
    await runStock();
    await runCommons();
  }

  if (!found.length) {
    // Every free source came back empty. Surface the first real failure if there
    // was one, otherwise say plainly that nothing matched.
    if (problems.length) throw problems[0];
    return [];
  }

  const ranked = rank(found);
  await cacheSet(cacheKey, ranked, DAY);
  return ranked;
}

function normalizeStock(a: any): VisualAsset {
  return {
    id: a.id,
    provider: a.provider,
    kind: a.kind === 'video' ? 'video' : 'photo',
    url: a.url,
    thumbUrl: a.thumbUrl || a.url,
    width: a.width || 0,
    height: a.height || 0,
    credit: a.credit,
  };
}

/** Portrait beats landscape, bigger beats smaller, photos beat illustrations. */
function rank(assets: VisualAsset[]): VisualAsset[] {
  const seen = new Set<string>();
  return assets
    .filter((a) => {
      if (!a.url || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .map((a) => {
      const ratio = a.height / Math.max(1, a.width);
      let score = 0;
      if (ratio >= 1.5) score += 40;
      else if (ratio >= 1.05) score += 24;
      else if (ratio >= 0.85) score += 10;
      score += Math.min(20, Math.max(0, a.height) / 120);
      if (a.illustration) score -= 8;
      if (a.provider === 'pexels') score += 6;
      return { a, score };
    })
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

/**
 * The labelled last resort. Nothing free matched the query, so generate an
 * illustration and mark it as one, both in the credits and on the frame.
 */
export function aiIllustration(query: string): VisualAsset {
  const prompt = `${query}, natural history photograph style, vertical composition, highly detailed, no text`;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1080&height=1920&nologo=true&seed=${Math.abs(hash(query)) % 100000}`;
  return {
    id: `ai-${hash(query)}`,
    provider: 'generated',
    kind: 'photo',
    url,
    thumbUrl: url,
    width: 1080,
    height: 1920,
    illustration: true,
    credit: {
      author: 'AI generated',
      authorUrl: '',
      source: 'Pollinations',
      sourceUrl: 'https://pollinations.ai/',
      license: 'AI illustration - not a photograph',
    },
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** The credits block the user pastes into a post caption. */
export function creditLines(assets: VisualAsset[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of assets) {
    if (!a) continue;
    const key = `${a.credit.source}|${a.credit.author}|${a.credit.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const licence = a.credit.license ? ` (${a.credit.license})` : '';
    out.push(`${a.credit.author} / ${a.credit.source}${licence} - ${a.credit.sourceUrl}`);
  }
  return out;
}
