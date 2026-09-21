import type { FontVibe } from '../../types';

/** Font stacks that resolve to something real on iOS Safari. */
const STACKS: Record<FontVibe, { weight: number; family: string; tracking: number }> = {
  'bold-sans': { weight: 900, family: '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif', tracking: -0.01 },
  rounded: { weight: 800, family: '"SF Pro Rounded", "Arial Rounded MT Bold", "Avenir Next", sans-serif', tracking: 0 },
  condensed: { weight: 800, family: '"HelveticaNeue-CondensedBlack", "Arial Narrow", Impact, sans-serif', tracking: 0.01 },
  serif: { weight: 700, family: 'Georgia, "Times New Roman", Times, serif', tracking: 0 },
  handwritten: { weight: 700, family: '"Bradley Hand", "Snell Roundhand", "Segoe Script", cursive', tracking: 0.02 },
  mono: { weight: 700, family: '"SF Mono", Menlo, Consolas, monospace', tracking: 0.03 },
};

export function fontFor(vibe: FontVibe, sizePx: number): string {
  const s = STACKS[vibe] || STACKS['bold-sans'];
  return `${s.weight} ${Math.round(sizePx)}px ${s.family}`;
}

export function trackingFor(vibe: FontVibe): number {
  return (STACKS[vibe] || STACKS['bold-sans']).tracking;
}
