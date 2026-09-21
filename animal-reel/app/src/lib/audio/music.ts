/**
 * Background beds are synthesised here rather than bundled as MP3s. Nothing is
 * downloaded, nothing is licensed, and the output is royalty-free by construction.
 */
export interface MusicTrack {
  id: string;
  name: string;
  mood: string;
  bpm: number;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'deep-drift', name: 'Deep Drift', mood: 'Slow documentary pad', bpm: 70 },
  { id: 'pulse', name: 'Pulse', mood: 'Driving fast-facts loop', bpm: 120 },
  { id: 'hollow', name: 'Hollow', mood: 'Sparse and uneasy', bpm: 66 },
  { id: 'ember', name: 'Ember', mood: 'Warm cinematic swell', bpm: 84 },
];

const NOTE = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);

export async function renderMusic(id: string, seconds: number, sampleRate = 48000): Promise<AudioBuffer> {
  const length = Math.ceil(seconds * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);

  switch (id) {
    case 'pulse':
      pulse(ctx, out, seconds);
      break;
    case 'hollow':
      hollow(ctx, out, seconds);
      break;
    case 'ember':
      ember(ctx, out, seconds);
      break;
    case 'deep-drift':
    default:
      deepDrift(ctx, out, seconds);
      break;
  }
  return ctx.startRendering();
}

function pad(ctx: OfflineAudioContext, dest: AudioNode, freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // A fixed detune per note keeps a pad from sounding sterile while staying
  // identical between the preview mix and the exported one.
  osc.detune.value = (((freq * 37) % 13) - 6);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(1.6, dur * 0.35));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function deepDrift(ctx: OfflineAudioContext, dest: AudioNode, seconds: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(dest);
  const chords = [
    [-24, -17, -12, -5],
    [-22, -15, -10, -3],
    [-26, -19, -14, -7],
  ];
  const bar = 8;
  for (let i = 0, t = 0; t < seconds; i++, t += bar) {
    const chord = chords[i % chords.length];
    for (const semi of chord) pad(ctx, filter, NOTE(semi), t, Math.min(bar + 1.5, seconds - t + 1), 0.065);
  }
}

function ember(ctx: OfflineAudioContext, dest: AudioNode, seconds: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1600;
  filter.connect(dest);
  const chords = [
    [-24, -12, -5, 3],
    [-22, -10, -3, 5],
    [-19, -7, 0, 7],
    [-20, -8, -1, 4],
  ];
  const bar = 4;
  for (let i = 0, t = 0; t < seconds; i++, t += bar) {
    const chord = chords[i % chords.length];
    chord.forEach((semi, j) => pad(ctx, filter, NOTE(semi), t + j * 0.05, Math.min(bar + 1, seconds - t + 1), j === 0 ? 0.07 : 0.045, 'triangle'));
  }
}

function hollow(ctx: OfflineAudioContext, dest: AudioNode, seconds: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  filter.connect(dest);
  pad(ctx, filter, NOTE(-29), 0, seconds, 0.075, 'sawtooth');
  pad(ctx, filter, NOTE(-28.6), 0, seconds, 0.05, 'sine');
  // Sparse bell hits that never land on a predictable beat.
  for (let t = 3; t < seconds; t += 5.5) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = NOTE(4 + ((t * 7) % 5));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 3.3);
  }
}

function pulse(ctx: OfflineAudioContext, dest: AudioNode, seconds: number) {
  const beat = 60 / 120;
  const bass = ctx.createBiquadFilter();
  bass.type = 'lowpass';
  bass.frequency.value = 2200;
  bass.connect(dest);

  const arp = [-12, -5, 0, 3, 0, -5];
  for (let i = 0, t = 0; t < seconds; i++, t += beat / 2) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = NOTE(arp[i % arp.length]);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.45);
    osc.connect(g).connect(bass);
    osc.start(t);
    osc.stop(t + beat * 0.5);
  }
  // Kick on every beat.
  for (let t = 0; t < seconds; t += beat) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.25);
  }
  for (let t = 0; t < seconds; t += 8) pad(ctx, bass, NOTE(-24), t, Math.min(8, seconds - t), 0.05, 'triangle');
}
