import type { VisualAsset } from '../../types';

const API = 'https://commons.wikimedia.org/w/api.php';

/** Licences we are willing to put in a published reel. */
const ALLOWED = [
  { test: /^cc0/i, name: 'CC0', attribution: false },
  { test: /^pd|public\s*domain/i, name: 'Public domain', attribution: false },
  { test: /^cc-by-sa/i, name: 'CC BY-SA', attribution: true },
  { test: /^cc-by(?!-)/i, name: 'CC BY', attribution: true },
];

function classify(raw: string): { name: string; attribution: boolean } | null {
  const v = (raw || '').trim();
  for (const a of ALLOWED) if (a.test.test(v)) return { name: prettyLicense(v, a.name), attribution: a.attribution };
  return null;
}

function prettyLicense(raw: string, fallback: string): string {
  const m = raw.match(/^(cc-by(?:-sa)?)-(\d\.\d)/i);
  if (m) return `${m[1].toUpperCase().replace('CC-BY', 'CC BY')} ${m[2]}`;
  if (/^cc0/i.test(raw)) return 'CC0';
  return fallback;
}

const stripHtml = (s: string) =>
  (s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Searches Wikimedia Commons. This is the important source for extinct animals:
 * fossils, skeletons, museum mounts and palaeoart live here and nowhere else free.
 */
export async function searchCommons(query: string, limit = 14): Promise<VisualAsset[]> {
  const url =
    `${API}?action=query&format=json&origin=*&generator=search` +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}` +
    `&gsrnamespace=6&gsrlimit=${limit}` +
    `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  const pages: any[] = Object.values(data?.query?.pages || {});

  const assets: VisualAsset[] = [];
  for (const page of pages) {
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata || {};
    const licence = classify(String(meta.License?.value || meta.LicenseShortName?.value || ''));
    if (!licence) continue; // anything not CC0 / CC BY / CC BY-SA is skipped outright
    if (!/\.(jpe?g|png|webp)$/i.test(info.url || '')) continue;

    const author = stripHtml(meta.Artist?.value || meta.Credit?.value || '') || 'Unknown author';
    assets.push({
      id: `commons-${page.pageid}`,
      provider: 'commons',
      kind: 'photo',
      url: info.thumburl || info.url,
      thumbUrl: info.thumburl || info.url,
      width: info.thumbwidth || info.width,
      height: info.thumbheight || info.height,
      credit: {
        author: author.slice(0, 120),
        authorUrl: '',
        source: 'Wikimedia Commons',
        sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
        license: licence.name,
      },
      illustration: /paleoart|palaeoart|restoration|reconstruction|illustration|artwork|drawing/i.test(
        String(page.title || '') + ' ' + stripHtml(meta.ImageDescription?.value || ''),
      ),
    });
  }
  return assets;
}
