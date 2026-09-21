/** The curated slice of Kokoro's voice list that the picker shows. */
export interface VoiceOption {
  id: string;
  label: string;
  vibe: string;
  gender: 'male' | 'female';
  /** Default speed that suits this voice. */
  speed: number;
}

export const VOICES: VoiceOption[] = [
  { id: 'am_michael', label: 'Atlas', vibe: 'Deep documentary', gender: 'male', speed: 0.95 },
  { id: 'am_fenrir', label: 'Fenrir', vibe: 'Dark and heavy', gender: 'male', speed: 0.92 },
  { id: 'am_puck', label: 'Puck', vibe: 'Energetic host', gender: 'male', speed: 1.12 },
  { id: 'af_heart', label: 'Ember', vibe: 'Warm and clear', gender: 'female', speed: 1.0 },
  { id: 'af_bella', label: 'Bella', vibe: 'Punchy and bright', gender: 'female', speed: 1.1 },
  { id: 'bf_emma', label: 'Emma', vibe: 'Calm British narrator', gender: 'female', speed: 0.98 },
];

export const DEFAULT_VOICE = 'am_michael';

export function voiceById(id: string): VoiceOption {
  return VOICES.find((v) => v.id === id) || VOICES[0];
}

/** Maps the voice traits Gemini reports for a reference reel onto our list. */
export function matchVoice(gender: 'male' | 'female' | 'either', energy: string): VoiceOption {
  const byEnergy: Record<string, string[]> = {
    calm: ['bf_emma', 'am_michael'],
    warm: ['af_heart', 'am_michael'],
    energetic: ['am_puck', 'af_bella'],
    intense: ['am_fenrir', 'am_puck'],
    spooky: ['am_fenrir', 'bf_emma'],
  };
  const candidates = (byEnergy[energy] || ['am_michael']).map(voiceById);
  const gendered = gender === 'either' ? candidates : candidates.filter((v) => v.gender === gender);
  return gendered[0] || candidates[0];
}
