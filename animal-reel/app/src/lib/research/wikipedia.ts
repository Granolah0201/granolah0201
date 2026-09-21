import { cacheGet, cacheSet } from '../db';
import { AppError } from '../../types';

const API = 'https://en.wikipedia.org/w/api.php';
const REST = 'https://en.wikipedia.org/w/rest.php/v1';
const WEEK = 7 * 24 * 60 * 60 * 1000;

export interface WikiSection {
  heading: string;
  text: string;
}

export interface WikiArticle {
  title: string;
  url: string;
  description: string;
  summary: string;
  thumbnail?: string;
  sections: WikiSection[];
  /** The whole article as plain text, with "== Heading ==" markers kept in. */
  plainText: string;
  wikibaseId?: string;
}

async function getJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new AppError('wikipedia_error', `Wikipedia returned ${res.status}.`);
  return res.json();
}

/** Finds the article title that best matches what the user typed. */
export async function findArticle(query: string): Promise<{ title: string; description: string }> {
  const cacheKey = `wiki.search.${query.toLowerCase()}`;
  const hit = await cacheGet<{ title: string; description: string }>(cacheKey);
  if (hit) return hit;

  const data = await getJSON(`${REST}/search/page?q=${encodeURIComponent(query)}&limit=5`);
  const pages: any[] = data?.pages || [];
  if (!pages.length) {
    throw new AppError('no_article', `Wikipedia has no article for "${query}".`, 'Try the common name, or the scientific name.');
  }
  // Prefer a page whose description reads like an organism rather than a film or band.
  const scored = pages
    .map((p) => {
      const desc = String(p.description || '').toLowerCase();
      let score = 0;
      if (/species|genus|family|animal|mammal|bird|fish|reptile|amphibian|insect|dinosaur|extinct|taxon/.test(desc)) score += 5;
      if (/film|album|song|band|video game|novel|company|town/.test(desc)) score -= 6;
      if (String(p.title).toLowerCase() === query.toLowerCase()) score += 3;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = { title: String(scored[0].p.title), description: String(scored[0].p.description || '') };
  await cacheSet(cacheKey, best, WEEK);
  return best;
}

/** Pulls the summary and the full plain-text article, split by section. */
export async function fetchArticle(title: string): Promise<WikiArticle> {
  const cacheKey = `wiki.article.${title}`;
  const hit = await cacheGet<WikiArticle>(cacheKey);
  if (hit) return hit;

  const url =
    `${API}?action=query&format=json&origin=*&redirects=1&titles=${encodeURIComponent(title)}` +
    `&prop=extracts|pageprops|pageimages|description&explaintext=1&exsectionformat=wiki` +
    `&ppprop=wikibase_item&piprop=original&pithumbsize=1200`;

  const data = await getJSON(url);
  const pages = data?.query?.pages || {};
  const page: any = Object.values(pages)[0];
  if (!page || page.missing !== undefined) {
    throw new AppError('no_article', `Wikipedia has no article called "${title}".`);
  }

  const plainText: string = page.extract || '';
  const sections = splitSections(plainText);
  const article: WikiArticle = {
    title: page.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`,
    description: page.description || '',
    summary: sections[0]?.text?.slice(0, 1200) || plainText.slice(0, 1200),
    thumbnail: page.original?.source,
    sections,
    plainText,
    wikibaseId: page.pageprops?.wikibase_item,
  };
  await cacheSet(cacheKey, article, WEEK);
  return article;
}

/** Turns the "== Heading ==" extract into labelled sections. */
function splitSections(text: string): WikiSection[] {
  const out: WikiSection[] = [];
  let heading = 'Introduction';
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) out.push({ heading, text: body });
    buf = [];
  };
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(={2,6})\s*(.+?)\s*\1\s*$/);
    if (m) {
      flush();
      heading = m[2];
    } else {
      buf.push(line);
    }
  }
  flush();
  // These sections never contain facts worth narrating.
  const skip = /^(references|external links|further reading|see also|notes|bibliography|sources|citations)$/i;
  return out.filter((s) => !skip.test(s.heading));
}

/** Packs the article into the budget the research prompt gets. */
export function buildSourceText(article: WikiArticle, maxChars = 48000): string {
  const parts: string[] = [`== ${article.title} ==`, article.description, ''];
  let used = parts.join('\n').length;
  for (const s of article.sections) {
    const block = `\n== ${s.heading} ==\n${s.text}\n`;
    if (used + block.length > maxChars) {
      const room = maxChars - used;
      if (room > 400) parts.push(`\n== ${s.heading} ==\n${s.text.slice(0, room - 100)}\n`);
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n');
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Checks that a quote Gemini attributed to the article really appears in it.
 * Exact first, then a looser word-overlap pass so small punctuation drift from
 * the model does not wrongly flag a genuine quote.
 */
export function verifyQuote(article: WikiArticle, quote: string): boolean {
  const q = normalize(quote);
  if (q.length < 12) return false;
  const haystack = normalize(article.plainText);
  if (haystack.includes(q)) return true;

  const words = q.split(' ').filter((w) => w.length > 3);
  if (words.length < 3) return false;
  const present = words.filter((w) => haystack.includes(w)).length;
  return present / words.length >= 0.9;
}

/** Finds which section a verified quote came from, for the editor's source chip. */
export function sectionForQuote(article: WikiArticle, quote: string): string {
  const q = normalize(quote);
  for (const s of article.sections) {
    if (normalize(s.text).includes(q)) return s.heading;
  }
  return '';
}
