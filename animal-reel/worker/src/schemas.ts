/** OpenAPI-subset schemas that force Gemini into exactly the JSON we parse. */

const S = (description?: string) => ({ type: 'STRING', ...(description ? { description } : {}) });
const N = (description?: string) => ({ type: 'NUMBER', ...(description ? { description } : {}) });
const B = (description?: string) => ({ type: 'BOOLEAN', ...(description ? { description } : {}) });

export const researchSchema = {
  type: 'OBJECT',
  properties: {
    commonName: S('The everyday name of the animal, title case.'),
    scientificName: S('Binomial name, or empty string if the sources do not give one.'),
    status: { type: 'STRING', enum: ['alive', 'extinct', 'unknown'] },
    era: S('For extinct animals: the geological period and rough dates. Empty string otherwise.'),
    hook: S('One spoken opening line, under 14 words, that makes someone stop scrolling.'),
    facts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: S('Short slug, e.g. "regrows-limbs".'),
          text: S('The fact written as one spoken sentence, 8-22 words, no citations.'),
          wow: N('How surprising this is to a general audience, 1-10.'),
          sourceSection: S('The heading of the section of the supplied source text this came from.'),
          sourceQuote: S('A verbatim span of 5-25 words copied exactly from the supplied source text that supports the fact.'),
          visualQuery: S('A 2-6 word image search query for this fact, e.g. "axolotl close up underwater".'),
        },
        required: ['id', 'text', 'wow', 'sourceSection', 'sourceQuote', 'visualQuery'],
      },
    },
    history: {
      type: 'OBJECT',
      properties: {
        summary: S('2-3 spoken sentences of history or discovery story.'),
        whenItLived: S('For extinct animals: when it lived. Empty string otherwise.'),
        howWeKnow: S('For extinct animals: the fossil evidence. Empty string otherwise.'),
        howItWentExtinct: S('For extinct animals: the extinction story. Empty string otherwise.'),
      },
      required: ['summary', 'whenItLived', 'howWeKnow', 'howItWentExtinct'],
    },
    closingLine: S('One spoken closing line under 12 words.'),
  },
  required: ['commonName', 'scientificName', 'status', 'era', 'hook', 'facts', 'history', 'closingLine'],
} as const;

export const scriptSchema = {
  type: 'OBJECT',
  properties: {
    title: S('Short project title, e.g. "Axolotl: the animal that refuses to grow up".'),
    scenes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: S('The voiceover line for this scene. One idea only. No stage directions, no emoji.'),
          visualQuery: S('2-6 word image search query for this scene.'),
          visualKind: { type: 'STRING', enum: ['photo', 'fossil', 'paleoart', 'skeleton', 'habitat', 'map', 'card'] },
          role: { type: 'STRING', enum: ['hook', 'fact', 'history', 'twist', 'cta'] },
          factId: S('The id of the research fact this scene uses, or empty string.'),
          emoji: S('One emoji that matches this line, or empty string.'),
        },
        required: ['text', 'visualQuery', 'visualKind', 'role', 'factId', 'emoji'],
      },
    },
    caption: S('A social caption of 1-2 sentences for the post.'),
    hashtags: { type: 'ARRAY', items: S('A hashtag including the # sign.') },
  },
  required: ['title', 'scenes', 'caption', 'hashtags'],
} as const;

export const styleSchema = {
  type: 'OBJECT',
  properties: {
    summary: S('2-3 sentences describing the overall feel of the reference.'),
    pacing: {
      type: 'OBJECT',
      properties: {
        secondsPerShot: N('Average seconds each shot stays on screen.'),
        cutsOnBeat: B('Whether cuts land on the music beat.'),
      },
      required: ['secondsPerShot', 'cutsOnBeat'],
    },
    hookStyle: { type: 'STRING', enum: ['question', 'shocking-fact', 'you-wont-believe', 'story-open', 'countdown'] },
    captionStyle: {
      type: 'OBJECT',
      properties: {
        fontVibe: { type: 'STRING', enum: ['bold-sans', 'rounded', 'condensed', 'serif', 'handwritten', 'mono'] },
        sizePct: N('Caption font size as a percentage of video height, 4-12.'),
        positionPct: N('Vertical centre of the caption block as a percentage of video height, 10-90.'),
        textCase: { type: 'STRING', enum: ['upper', 'sentence', 'lower'] },
        color: S('Base caption colour as #rrggbb.'),
        highlightColor: S('Colour of the currently spoken word as #rrggbb.'),
        strokeColor: S('Outline colour as #rrggbb.'),
        strokeWidthPct: N('Outline width as a percentage of the font size, 0-14.'),
        shadow: B('Whether captions have a drop shadow.'),
        animation: { type: 'STRING', enum: ['none', 'pop', 'fade', 'slide-up', 'bounce'] },
        wordsPerChunk: N('How many words appear at once, 1-4.'),
        emoji: B('Whether emoji are sprinkled into the captions.'),
      },
      required: ['fontVibe', 'sizePct', 'positionPct', 'textCase', 'color', 'highlightColor', 'strokeColor', 'strokeWidthPct', 'shadow', 'animation', 'wordsPerChunk', 'emoji'],
    },
    editing: {
      type: 'OBJECT',
      properties: {
        zoomIntensity: N('Ken Burns strength, 0 (static) to 1 (aggressive).'),
        transition: { type: 'STRING', enum: ['cut', 'fade', 'whip', 'zoom'] },
        textOverlays: B('Whether extra title cards or labels appear.'),
        progressBar: B('Whether a progress bar runs along an edge.'),
        grade: { type: 'STRING', enum: ['neutral', 'warm', 'cool', 'dark', 'high-contrast', 'vintage'] },
      },
      required: ['zoomIntensity', 'transition', 'textOverlays', 'progressBar', 'grade'],
    },
    format: {
      type: 'OBJECT',
      properties: {
        targetSeconds: N('Total length in seconds.'),
        structure: { type: 'ARRAY', items: { type: 'STRING', enum: ['hook', 'fact', 'history', 'twist', 'cta'] } },
        tone: S('Tone of voice in a few words, e.g. "calm authoritative documentary".'),
      },
      required: ['targetSeconds', 'structure', 'tone'],
    },
    voice: {
      type: 'OBJECT',
      properties: {
        gender: { type: 'STRING', enum: ['male', 'female', 'either'] },
        energy: { type: 'STRING', enum: ['calm', 'warm', 'energetic', 'intense', 'spooky'] },
        speed: N('Speaking speed multiplier, 0.8-1.4.'),
      },
      required: ['gender', 'energy', 'speed'],
    },
  },
  required: ['summary', 'pacing', 'hookStyle', 'captionStyle', 'editing', 'format', 'voice'],
} as const;

export const lineSchema = {
  type: 'OBJECT',
  properties: {
    text: S('The rewritten voiceover line.'),
    visualQuery: S('A 2-6 word image search query that suits the rewritten line.'),
    emoji: S('One matching emoji, or an empty string.'),
  },
  required: ['text', 'visualQuery', 'emoji'],
} as const;
