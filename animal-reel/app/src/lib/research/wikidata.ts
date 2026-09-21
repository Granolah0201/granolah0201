import { cacheGet, cacheSet } from '../db';
import type { AnimalStatus } from '../../types';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export interface WikidataFacts {
  id: string;
  url: string;
  taxonName?: string;
  taxonRank?: string;
  parentTaxon?: string;
  conservationStatus?: string;
  temporalRangeStart?: string;
  temporalRangeEnd?: string;
  lengthCm?: number;
  massKg?: number;
  endemicTo?: string;
  status: AnimalStatus;
  /** Flat text handed to Gemini alongside the article. */
  text: string;
}

// Wikidata property ids we read.
const P = {
  instanceOf: 'P31',
  taxonRank: 'P105',
  taxonName: 'P225',
  parentTaxon: 'P171',
  conservation: 'P141',
  rangeStart: 'P523',
  rangeEnd: 'P524',
  length: 'P2043',
  mass: 'P2067',
  endemicTo: 'P183',
} as const;

const Q_FOSSIL_TAXON = 'Q23038290';
const Q_EXTINCT = 'Q237350';
const Q_EXTINCT_IN_WILD = 'Q239509';

export async function fetchWikidata(entityId: string): Promise<WikidataFacts | null> {
  const cacheKey = `wikidata.${entityId}`;
  const hit = await cacheGet<WikidataFacts>(cacheKey);
  if (hit) return hit;

  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`);
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const entity = data?.entities?.[entityId];
  if (!entity) return null;
  const claims = entity.claims || {};

  const itemIds = (pid: string): string[] =>
    (claims[pid] || [])
      .map((c: any) => c?.mainsnak?.datavalue?.value?.id)
      .filter((v: unknown): v is string => typeof v === 'string');

  const stringValue = (pid: string): string | undefined =>
    (claims[pid] || []).map((c: any) => c?.mainsnak?.datavalue?.value).find((v: unknown) => typeof v === 'string');

  const quantity = (pid: string): number | undefined => {
    const v = (claims[pid] || [])[0]?.mainsnak?.datavalue?.value;
    return v?.amount ? Number(v.amount) : undefined;
  };

  const referenced = [
    ...itemIds(P.taxonRank),
    ...itemIds(P.parentTaxon),
    ...itemIds(P.conservation),
    ...itemIds(P.rangeStart),
    ...itemIds(P.rangeEnd),
    ...itemIds(P.endemicTo),
  ];
  const labels = await fetchLabels(Array.from(new Set(referenced)).slice(0, 25));
  const label = (ids: string[]) => (ids[0] ? labels[ids[0]] || ids[0] : undefined);

  const instanceOf = itemIds(P.instanceOf);
  const conservationIds = itemIds(P.conservation);
  const rangeEnd = itemIds(P.rangeEnd);

  const isExtinct =
    instanceOf.includes(Q_FOSSIL_TAXON) ||
    conservationIds.includes(Q_EXTINCT) ||
    conservationIds.includes(Q_EXTINCT_IN_WILD) ||
    rangeEnd.length > 0;

  const facts: WikidataFacts = {
    id: entityId,
    url: `https://www.wikidata.org/wiki/${entityId}`,
    taxonName: stringValue(P.taxonName),
    taxonRank: label(itemIds(P.taxonRank)),
    parentTaxon: label(itemIds(P.parentTaxon)),
    conservationStatus: label(conservationIds),
    temporalRangeStart: label(itemIds(P.rangeStart)),
    temporalRangeEnd: label(rangeEnd),
    lengthCm: quantity(P.length),
    massKg: quantity(P.mass),
    endemicTo: label(itemIds(P.endemicTo)),
    status: isExtinct ? 'extinct' : conservationIds.length ? 'alive' : 'unknown',
    text: '',
  };
  facts.text = toText(facts);

  await cacheSet(cacheKey, facts, WEEK);
  return facts;
}

async function fetchLabels(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*` +
    `&props=labels&languages=en&ids=${ids.join('|')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = (await res.json()) as any;
    const out: Record<string, string> = {};
    for (const [id, ent] of Object.entries<any>(data?.entities || {})) {
      const l = ent?.labels?.en?.value;
      if (l) out[id] = l;
    }
    return out;
  } catch {
    return {};
  }
}

function toText(f: WikidataFacts): string {
  const rows: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') rows.push(`${k}: ${v}`);
  };
  add('Scientific name', f.taxonName);
  add('Taxon rank', f.taxonRank);
  add('Parent taxon', f.parentTaxon);
  add('Conservation status', f.conservationStatus);
  add('Temporal range start', f.temporalRangeStart);
  add('Temporal range end', f.temporalRangeEnd);
  add('Length (cm)', f.lengthCm);
  add('Mass (kg)', f.massKg);
  add('Endemic to', f.endemicTo);
  add('Derived status', f.status);
  return rows.join('\n');
}

/** A short "when it lived" line for the Prehistoric preset's timeline card. */
export function eraLine(f?: WikidataFacts | null): string {
  if (!f) return '';
  const { temporalRangeStart: a, temporalRangeEnd: b } = f;
  if (a && b) return a === b ? a : `${a} to ${b}`;
  return a || b || '';
}
