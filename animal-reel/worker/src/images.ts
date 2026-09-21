import type { Env } from './env';

export interface StockAsset {
  id: string;
  provider: 'pexels' | 'pixabay';
  kind: 'photo' | 'video';
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  /** Seconds, for video assets only. */
  duration?: number;
  credit: {
    author: string;
    authorUrl: string;
    source: string;
    sourceUrl: string;
    license: string;
  };
}

export class ProviderError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSeconds?: number) {
    super(message);
  }
}

export async function searchPexels(env: Env, query: string, perPage: number, kind: 'photo' | 'video'): Promise<StockAsset[]> {
  const key = env.PEXELS_API_KEY;
  if (!key) throw new ProviderError(503, 'no_pexels_key', 'The Worker has no PEXELS_API_KEY set.');

  const base = kind === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search';
  const url = `${base}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Authorization: key } });

  if (res.status === 429) {
    throw new ProviderError(429, 'pexels_rate_limit', 'Pexels hourly limit reached (200/hour). Cached results are still available.', 900);
  }
  if (!res.ok) throw new ProviderError(res.status, 'pexels_error', `Pexels returned ${res.status}.`);
  const data = (await res.json()) as any;

  if (kind === 'video') {
    return (data.videos || []).map((v: any): StockAsset => {
      const files = (v.video_files || [])
        .filter((f: any) => f.height && f.width)
        .sort((a: any, b: any) => portraitScore(b) - portraitScore(a));
      const file = files[0] || v.video_files?.[0] || {};
      return {
        id: `pexels-v-${v.id}`,
        provider: 'pexels',
        kind: 'video',
        url: file.link,
        thumbUrl: v.image,
        width: file.width || v.width,
        height: file.height || v.height,
        duration: v.duration,
        credit: {
          author: v.user?.name || 'Unknown',
          authorUrl: v.user?.url || '',
          source: 'Pexels',
          sourceUrl: v.url,
          license: 'Pexels License',
        },
      };
    }).filter((a: StockAsset) => !!a.url);
  }

  return (data.photos || []).map((p: any): StockAsset => ({
    id: `pexels-${p.id}`,
    provider: 'pexels',
    kind: 'photo',
    url: p.src?.large2x || p.src?.large || p.src?.original,
    thumbUrl: p.src?.medium || p.src?.small,
    width: p.width,
    height: p.height,
    credit: {
      author: p.photographer || 'Unknown',
      authorUrl: p.photographer_url || '',
      source: 'Pexels',
      sourceUrl: p.url,
      license: 'Pexels License',
    },
  }));
}

function portraitScore(f: any): number {
  const ratio = f.height / Math.max(1, f.width);
  // Prefer tall files, then bigger ones, but stay under 1440p to keep downloads sane.
  const sizePenalty = f.height > 1920 ? 0.5 : 1;
  return ratio * sizePenalty * Math.min(f.height, 1920);
}

export async function searchPixabay(env: Env, query: string, perPage: number): Promise<StockAsset[]> {
  const key = env.PIXABAY_API_KEY;
  if (!key) throw new ProviderError(503, 'no_pixabay_key', 'The Worker has no PIXABAY_API_KEY set.');

  const url =
    `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}` +
    `&image_type=photo&orientation=vertical&safesearch=true&per_page=${Math.max(3, perPage)}`;
  const res = await fetch(url);
  if (res.status === 429) {
    throw new ProviderError(429, 'pixabay_rate_limit', 'Pixabay rate limit reached. Try again in a minute.', 60);
  }
  if (!res.ok) throw new ProviderError(res.status, 'pixabay_error', `Pixabay returned ${res.status}.`);
  const data = (await res.json()) as any;

  return (data.hits || []).map((h: any): StockAsset => ({
    id: `pixabay-${h.id}`,
    provider: 'pixabay',
    kind: 'photo',
    url: h.largeImageURL || h.webformatURL,
    thumbUrl: h.previewURL || h.webformatURL,
    width: h.imageWidth || h.webformatWidth,
    height: h.imageHeight || h.webformatHeight,
    credit: {
      author: h.user || 'Unknown',
      authorUrl: h.user_id ? `https://pixabay.com/users/${h.user}-${h.user_id}/` : 'https://pixabay.com/',
      source: 'Pixabay',
      sourceUrl: h.pageURL,
      license: 'Pixabay Content License',
    },
  }));
}

/** Hosts the image proxy will fetch from. Anything else is refused. */
const PROXY_HOSTS = [
  'images.pexels.com',
  'videos.pexels.com',
  'player.vimeo.com',
  'pixabay.com',
  'cdn.pixabay.com',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'upload.wikipedia.org',
  'image.pollinations.ai',
];

export function proxyAllows(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  return PROXY_HOSTS.includes(u.hostname) ? u : null;
}
