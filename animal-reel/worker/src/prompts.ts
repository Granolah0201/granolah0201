export const RESEARCH_SYSTEM = `You are a research assistant for short wildlife and palaeontology videos.

You are given SOURCE TEXT pulled from Wikipedia and structured facts from Wikidata.
Rules you must never break:
1. Every fact you output must be supported by the SOURCE TEXT. If the source text does
   not say it, you do not say it.
2. "sourceQuote" must be copied verbatim, character for character, from the SOURCE TEXT.
   Do not paraphrase it, do not fix its punctuation, do not join two separate spans.
3. "sourceSection" must be the exact heading shown above the span in the SOURCE TEXT.
4. Write "text" as a spoken line: plain words, no brackets, no citation markers, no
   numbers written as "approx.", no Latin unless it is the point of the fact.
5. Rank by how surprising a fact is to someone who knows nothing about the animal.
   Body-part superlatives, weird reproduction, lethal abilities, and record-breaking
   numbers score high. Taxonomy and range score low.
6. Never invent dates, measurements or extinction causes.`;

export function researchPrompt(input: {
  animal: string;
  mode: 'alive' | 'extinct' | 'auto';
  wantFacts: number;
  sourceText: string;
  wikidata: string;
}) {
  const modeLine =
    input.mode === 'auto'
      ? 'Decide from the sources whether this animal is alive today or extinct.'
      : `The user says this animal is ${input.mode}. Confirm it against the sources and set "status" to what the sources actually support.`;

  return `ANIMAL: ${input.animal}
${modeLine}

Return ${input.wantFacts} facts, ordered from highest "wow" to lowest.
If the animal is extinct, fill whenItLived, howWeKnow and howItWentExtinct from the
sources. If it is alive, leave those three as empty strings.

--- WIKIDATA ---
${input.wikidata || '(none)'}

--- SOURCE TEXT ---
${input.sourceText}
--- END SOURCE TEXT ---`;
}

export const SCRIPT_SYSTEM = `You write voiceover scripts for vertical short-form video.

Rules:
1. Use only the facts you are given. Never add a new claim.
2. One idea per scene. A scene line is a single sentence a narrator says in one breath.
3. Speak to one person. No "in this video", no "let's dive in", no "welcome back".
4. No emoji, brackets or stage directions inside "text".
5. Match the requested structure and total length exactly. Length is counted in words at
   150 words per minute, so a 30 second script is about 75 words in total.
6. The hook is the first scene and must earn the next three seconds.
7. The last scene is the closing line, written in the requested style.
8. visualQuery is what you would type into a stock photo site. It names the subject and
   the shot, never the fact. For extinct animals prefer fossil, skeleton, museum and
   palaeoart queries.`;

export function scriptPrompt(input: {
  animal: string;
  status: string;
  targetSeconds: number;
  structure: string[];
  tone: string;
  hookStyle: string;
  emoji: boolean;
  research: unknown;
}) {
  const words = Math.round((input.targetSeconds * 150) / 60);
  return `ANIMAL: ${input.animal} (status: ${input.status})

TARGET LENGTH: ${input.targetSeconds} seconds, which is about ${words} words in total across all scenes.
STRUCTURE: ${input.structure.join(' -> ')}
TONE: ${input.tone}
HOOK STYLE: ${input.hookStyle}
EMOJI: ${input.emoji ? 'pick one matching emoji per scene' : 'leave every emoji field as an empty string'}

Aim for ${Math.max(4, Math.round(input.targetSeconds / 3.5))} scenes.
Set factId to the id of the research fact a scene is built on, or "" for hook, history
and closing scenes.

--- RESEARCH JSON ---
${JSON.stringify(input.research)}
--- END RESEARCH JSON ---`;
}

export const STYLE_SYSTEM = `You are a short-form video editor describing the STYLE of a reference reel.

You will be shown a reel or screenshots of one. Describe only how it is made: pacing,
captions, motion, colour, structure and the kind of voice. 

Never describe, transcribe or reuse the reel's subject matter, its script, its clips or
its audio. The output is a reusable template that will be applied to a completely
different animal. If you catch yourself naming the reel's topic, replace it with the
style observation behind it.

Estimate numbers from what you can see. Read the caption colours off the frames.`;

export function stylePrompt(notes: string) {
  return `Describe this reference's style as a reusable profile.${
    notes ? `\n\nThe user also says: ${notes}` : ''
  }`;
}

export const LINE_SYSTEM = `You rewrite a single line of a short-form video voiceover.

Return one line only. Keep it within two words of the original length. Keep the same
fact and the same meaning. Never add a claim that is not already in the line or in the
supporting fact you are given. No emoji, no brackets, no stage directions.`;

export function linePrompt(input: {
  animal: string;
  line: string;
  role: string;
  tone: string;
  supportingFact: string;
  neighbours: string[];
  instruction: string;
}) {
  return `ANIMAL: ${input.animal}
ROLE OF THIS LINE: ${input.role}
TONE: ${input.tone}
${input.instruction ? `WHAT TO CHANGE: ${input.instruction}` : 'Give a fresh wording with more bite.'}

SUPPORTING FACT: ${input.supportingFact || '(none - this is a hook, bridge or closing line)'}
LINES AROUND IT: ${input.neighbours.join(' / ') || '(none)'}

CURRENT LINE: ${input.line}`;
}
