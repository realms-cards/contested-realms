/**
 * Synthesized sound effects.
 *
 * Every patch is built at play time from oscillators, filtered noise and
 * two-operator FM, so no audio files are fetched. Patches were auditioned and
 * approved on the "Realms Sound Bench" page; keep recipes in sync with it when
 * tuning.
 */

/** Mix group a sound belongs to; each group can be muted in audio settings. */
export type SfxGroup = "board" | "alerts" | "interface";

/** Who caused the sound. Opponent actions use a lower, quieter voice. */
export type SfxActor = "me" | "opponent";

/** Render target handed to a patch. */
export type SynthVoice = {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** Pitch offset applied to every oscillator, in cents. */
  cents: number;
};

type Envelope = {
  /** Attack seconds. */
  a?: number;
  /** Decay seconds. */
  d?: number;
  /** Sustain level as a fraction of the peak. */
  s?: number;
  /** Release seconds. */
  r?: number;
  /** Seconds the sustain level is held before release. */
  hold?: number;
};

type ToneOptions = Envelope & {
  type?: OscillatorType;
  freq: number;
  /** Glide target frequency. */
  to?: number;
  glide?: number;
  detune?: number;
  gain?: number;
  /** Optional lowpass cutoff, swept to lpTo over the envelope. */
  lp?: number;
  lpTo?: number;
  q?: number;
};

type NoiseOptions = Envelope & {
  type?: BiquadFilterType;
  freq?: number;
  /** Filter sweep target, reached at the end of the envelope. */
  to?: number;
  q?: number;
  gain?: number;
};

type FmOptions = Envelope & {
  type?: OscillatorType;
  freq: number;
  to?: number;
  glide?: number;
  /** Modulator frequency as a multiple of the carrier. */
  ratio?: number;
  /** Peak frequency deviation in Hz, decaying to zero. */
  index?: number;
  indexDecay?: number;
  gain?: number;
};

const MIN_GAIN = 0.0001;

/** ADSR on an AudioParam. Returns the time the release ends. */
function envelope(
  param: AudioParam,
  t0: number,
  peak: number,
  o: Envelope,
): number {
  const a = o.a ?? 0.004;
  const d = o.d ?? 0.1;
  const r = o.r ?? 0.06;
  const hold = o.hold ?? 0;
  const top = Math.max(peak, MIN_GAIN);
  const sustain = Math.max(top * (o.s ?? 0), MIN_GAIN);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(MIN_GAIN, t0);
  param.linearRampToValueAtTime(top, t0 + a);
  param.exponentialRampToValueAtTime(sustain, t0 + a + d);
  if (hold > 0) param.setValueAtTime(sustain, t0 + a + d + hold);
  const end = t0 + a + d + hold + r;
  param.exponentialRampToValueAtTime(MIN_GAIN, end);
  return end;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

/** One oscillator voice with optional glide and lowpass sweep. */
function tone(v: SynthVoice, t0: number, o: ToneOptions): number {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) {
    osc.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide ?? 0.1));
  }
  osc.detune.value = (o.detune ?? 0) + v.cents;
  const amp = ctx.createGain();
  amp.gain.value = 0;
  const end = envelope(amp.gain, t0, o.gain ?? 0.4, o);
  osc.connect(amp);
  if (o.lp) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(o.lp, t0);
    if (o.lpTo) filter.frequency.exponentialRampToValueAtTime(o.lpTo, end);
    filter.Q.value = o.q ?? 0.7;
    amp.connect(filter);
    filter.connect(v.out);
  } else {
    amp.connect(v.out);
  }
  osc.start(t0);
  osc.stop(end + 0.05);
  return end;
}

/** Filtered noise burst with an optional filter sweep. */
function noise(v: SynthVoice, t0: number, o: NoiseOptions): number {
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? "bandpass";
  filter.frequency.setValueAtTime(o.freq ?? 1500, t0);
  filter.Q.value = o.q ?? 1;
  const amp = ctx.createGain();
  amp.gain.value = 0;
  const end = envelope(amp.gain, t0, o.gain ?? 0.3, o);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, end);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(v.out);
  src.start(t0, Math.random() * 1.5);
  src.stop(end + 0.05);
  return end;
}

/** Two-operator FM with a decaying modulation index. */
function fm(v: SynthVoice, t0: number, o: FmOptions): number {
  const { ctx } = v;
  const carrier = ctx.createOscillator();
  carrier.type = o.type ?? "sine";
  carrier.frequency.setValueAtTime(o.freq, t0);
  if (o.to) {
    carrier.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide ?? 0.2));
  }
  carrier.detune.value = v.cents;
  const modulator = ctx.createOscillator();
  modulator.frequency.value = o.freq * (o.ratio ?? 2);
  modulator.detune.value = v.cents;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(o.index ?? 200, t0);
  depth.gain.exponentialRampToValueAtTime(MIN_GAIN, t0 + (o.indexDecay ?? 0.3));
  modulator.connect(depth);
  depth.connect(carrier.frequency);
  const amp = ctx.createGain();
  amp.gain.value = 0;
  const end = envelope(amp.gain, t0, o.gain ?? 0.4, o);
  carrier.connect(amp);
  amp.connect(v.out);
  modulator.start(t0);
  carrier.start(t0);
  modulator.stop(end + 0.05);
  carrier.stop(end + 0.05);
  return end;
}

// ─── Chant ───────────────────────────────────────────────────────────────

type Vowel = "a" | "o" | "u";

/** Bass-singer formants per vowel: [centre Hz, level dB, bandwidth Hz]. */
const FORMANTS: Record<Vowel, readonly (readonly [number, number, number])[]> = {
  a: [[600, 0, 60], [1040, -7, 70], [2250, -9, 110]],
  o: [[400, 0, 40], [750, -11, 80], [2400, -21, 100]],
  u: [[350, 0, 40], [600, -20, 80], [2400, -32, 100]],
};

type ChantNote = { freq: number; at: number; glide?: number };
type ChantPart = { interval: number; gain: number };

type ChantOptions = {
  /** Melody: the first note starts at 0, later notes glide in at `at` seconds. */
  notes: readonly [ChantNote, ...ChantNote[]];
  /** Voice parts relative to the melody in semitones (organum): 0, -7, -12… */
  parts?: readonly ChantPart[];
  /** Singers per part, spread in pitch so the part sounds like a choir. */
  voices?: number;
  spread?: number;
  vowel?: Vowel;
  a?: number;
  hold?: number;
  r?: number;
  gain?: number;
  /** Lowpass after the formants; lower is darker. */
  lp?: number;
  /** Cathedral reverb send level. */
  reverb?: number;
  tail?: number;
  vibrato?: number;
};

const hallImpulses = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A short stone-hall impulse response: decaying noise with a soft onset. */
function hallImpulse(ctx: BaseAudioContext): AudioBuffer {
  const cached = hallImpulses.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 1.6);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const onset = t < 0.012 ? t / 0.012 : 1;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * onset;
    }
  }
  hallImpulses.set(ctx, buffer);
  return buffer;
}

/** A small male choir singing one vowel through a formant bank, with hall reverb. */
function chant(v: SynthVoice, t0: number, o: ChantOptions): number {
  const { ctx } = v;
  const attack = o.a ?? 0.05;
  const hold = o.hold ?? 0.45;
  const release = o.r ?? 0.18;
  const singEnd = t0 + attack + hold + release;
  const perPart = Math.max(1, o.voices ?? 3);
  const spread = o.spread ?? 9;

  const choir = ctx.createGain();
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = o.vibrato ?? 6;
  vibrato.connect(vibratoDepth);
  const oscillators: OscillatorNode[] = [vibrato];

  for (const part of o.parts ?? [{ interval: 0, gain: 1 }]) {
    const ratio = Math.pow(2, part.interval / 12);
    for (let i = 0; i < perPart; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      let previous = o.notes[0].freq * ratio;
      osc.frequency.setValueAtTime(previous, t0);
      for (const note of o.notes.slice(1)) {
        const target = note.freq * ratio;
        osc.frequency.setValueAtTime(previous, t0 + note.at - (note.glide ?? 0.05));
        osc.frequency.exponentialRampToValueAtTime(target, t0 + note.at);
        previous = target;
      }
      const offset = perPart > 1 ? ((i / (perPart - 1)) * 2 - 1) * spread : 0;
      osc.detune.value = v.cents + offset + (Math.random() * 4 - 2);
      vibratoDepth.connect(osc.detune);
      const level = ctx.createGain();
      level.gain.value = part.gain / perPart;
      osc.connect(level);
      level.connect(choir);
      oscillators.push(osc);
    }
  }

  const amp = ctx.createGain();
  amp.gain.value = 0;
  envelope(amp.gain, t0, o.gain ?? 1, { a: attack, d: 0.01, s: 1, hold: Math.max(0, hold - 0.01), r: release });
  // Cut the buzz of the sawtooth sources above the formants.
  const darken = ctx.createBiquadFilter();
  darken.type = "lowpass";
  darken.frequency.value = o.lp ?? 1700;
  darken.Q.value = 0.5;
  darken.connect(amp);
  for (const [freq, db, bandwidth] of FORMANTS[o.vowel ?? "o"]) {
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = freq;
    // A choir smears each formant; double the solo-singer bandwidth.
    formant.Q.value = freq / (bandwidth * 2);
    const formantLevel = ctx.createGain();
    formantLevel.gain.value = Math.pow(10, db / 20);
    choir.connect(formant);
    formant.connect(formantLevel);
    formantLevel.connect(darken);
  }
  amp.connect(v.out);

  let end = singEnd;
  const wet = o.reverb ?? 0.35;
  if (wet > 0) {
    const hall = ctx.createConvolver();
    hall.buffer = hallImpulse(ctx);
    const wetLevel = ctx.createGain();
    wetLevel.gain.value = wet;
    amp.connect(hall);
    hall.connect(wetLevel);
    wetLevel.connect(v.out);
    end = singEnd + (o.tail ?? 0.9);
  }
  for (const osc of oscillators) {
    osc.start(t0);
    osc.stop(singEnd + 0.05);
  }
  return end;
}

/** Schedule `steps` calls of `fn`, spaced by a fixed or per-step gap. */
function seq(
  t0: number,
  steps: number,
  gap: number | readonly number[],
  fn: (t: number, i: number) => number,
): number {
  let t = t0;
  let end = t0;
  for (let i = 0; i < steps; i++) {
    end = Math.max(end, fn(t, i));
    t += typeof gap === "number" ? gap : (gap[i] ?? gap[gap.length - 1] ?? 0);
  }
  return end;
}

export type SynthPatch = {
  group: SfxGroup;
  /** Schedules the sound at t0 and returns when it ends. */
  build: (v: SynthVoice, t0: number) => number;
};

const at = (arr: readonly number[], i: number): number => arr[i] ?? arr[0] ?? 0;

export const SYNTH_PATCHES = {
  // ── Cards & zones ────────────────────────────────────────────────────
  /** Paper slide: a soft rising rustle, no pitched tick. */
  draw: {
    group: "board",
    build: (v, t) =>
      noise(v, t, { freq: 1200, to: 3800, q: 0.9, a: 0.02, d: 0.17, gain: 0.3 }),
  },
  discard: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { type: "lowpass", freq: 1800, to: 600, a: 0.004, d: 0.14, gain: 0.35 });
      return tone(v, t, { freq: 200, to: 120, glide: 0.12, d: 0.12, gain: 0.25 });
    },
  },
  /**
   * Miserere: a short burst of dark plainchant. The choir falls a half step
   * (F3 to E3, Phrygian) in parallel fifths with an octave below, vowel "o",
   * in a stone hall.
   */
  toCemetery: {
    group: "board",
    build: (v, t) =>
      chant(v, t, {
        notes: [{ freq: 174.61, at: 0 }, { freq: 164.81, at: 0.17 }],
        parts: [
          { interval: 0, gain: 1 },
          { interval: -7, gain: 0.7 },
          { interval: -12, gain: 0.55 },
        ],
        vowel: "o",
        a: 0.05,
        hold: 0.42,
        r: 0.2,
        gain: 1,
        lp: 1700,
        reverb: 0.35,
      }),
  },
  /** Into the void: reverse swell with a hard cut, then a low drop. */
  banish: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { type: "lowpass", freq: 250, to: 4000, a: 0.35, d: 0.01, r: 0.03, gain: 0.3 });
      return tone(v, t + 0.38, { freq: 110, to: 50, glide: 0.3, d: 0.3, r: 0.05, gain: 0.45 });
    },
  },
  returnToHand: {
    group: "board",
    build: (v, t) => {
      tone(v, t, { freq: 660, d: 0.06, gain: 0.3 });
      return tone(v, t + 0.09, { freq: 990, d: 0.08, gain: 0.3 });
    },
  },
  counterUp: {
    group: "board",
    build: (v, t) => tone(v, t, { freq: 1320, to: 1560, glide: 0.06, d: 0.09, gain: 0.3 }),
  },
  counterDown: {
    group: "board",
    build: (v, t) => tone(v, t, { freq: 1320, to: 1100, glide: 0.06, d: 0.09, gain: 0.3 }),
  },
  token: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { freq: 6000, q: 3, d: 0.08, gain: 0.12 });
      tone(v, t, { type: "triangle", freq: 880, d: 0.18, gain: 0.25 });
      return tone(v, t + 0.02, { type: "triangle", freq: 1320, d: 0.2, gain: 0.18 });
    },
  },
  reveal: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { type: "highpass", freq: 3000, d: 0.03, gain: 0.25 });
      return tone(v, t + 0.01, { type: "triangle", freq: 1760, d: 0.07, gain: 0.22 });
    },
  },
  transform: {
    group: "board",
    build: (v, t) =>
      fm(v, t, {
        freq: 300, to: 600, glide: 0.5, ratio: 2, index: 400, indexDecay: 0.55,
        a: 0.03, d: 0.55, r: 0.25, gain: 0.3,
      }),
  },

  // ── Board & combat ───────────────────────────────────────────────────
  move: {
    group: "board",
    build: (v, t) =>
      seq(t, 2, 0.07, (tt, i) =>
        noise(v, tt, { type: "lowpass", freq: 900 - i * 200, d: 0.04, gain: 0.35 }),
      ),
  },
  sitePlaced: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { type: "lowpass", freq: 400, d: 0.12, gain: 0.4 });
      return tone(v, t, { freq: 70, to: 45, glide: 0.22, d: 0.3, gain: 0.8 });
    },
  },
  minionEnters: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { freq: 1200, q: 0.7, d: 0.06, gain: 0.15 });
      return fm(v, t, { freq: 196, ratio: 1, index: 150, indexDecay: 0.25, a: 0.01, d: 0.3, r: 0.15, gain: 0.35 });
    },
  },
  spellCast: {
    group: "board",
    build: (v, t) => {
      fm(v, t, { freq: 880, ratio: 3.5, index: 400, indexDecay: 0.4, d: 0.3, r: 0.5, gain: 0.25 });
      return fm(v, t + 0.06, { freq: 1320, ratio: 3.5, index: 300, indexDecay: 0.35, d: 0.3, r: 0.55, gain: 0.18 });
    },
  },
  attack: {
    group: "board",
    build: (v, t) => {
      tone(v, t, { type: "sawtooth", freq: 110, d: 0.18, gain: 0.3, lp: 800, lpTo: 200 });
      return tone(v, t, { type: "sawtooth", freq: 165, detune: 8, d: 0.18, gain: 0.2, lp: 800, lpTo: 200 });
    },
  },
  hit: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { freq: 3000, q: 1.5, d: 0.03, gain: 0.3 });
      return tone(v, t, { type: "square", freq: 140, to: 90, glide: 0.08, d: 0.08, gain: 0.25, lp: 1200 });
    },
  },
  kill: {
    group: "board",
    build: (v, t) => {
      noise(v, t, { type: "lowpass", freq: 3000, to: 200, d: 0.5, gain: 0.35 });
      return tone(v, t, { type: "sawtooth", freq: 55, d: 0.5, r: 0.2, gain: 0.35, lp: 600, lpTo: 100 });
    },
  },
  deathsDoor: {
    group: "board",
    build: (v, t) => seq(t, 9, 0.125, (tt) => tone(v, tt, { freq: 55, a: 0.02, d: 0.08, gain: 0.55 })),
  },
  dice: {
    group: "board",
    build: (v, t) => {
      const gaps = [0.04, 0.045, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11] as const;
      const end = seq(t, 9, gaps, (tt) => noise(v, tt, { freq: 1800, q: 4, d: 0.025, gain: 0.3 }));
      return tone(v, end, { type: "triangle", freq: 2400, d: 0.15, gain: 0.25 });
    },
  },
  flood: {
    group: "board",
    build: (v, t) => noise(v, t, { type: "lowpass", freq: 900, to: 300, a: 0.15, d: 0.6, gain: 0.35 }),
  },
  endTurn: {
    group: "board",
    build: (v, t) => {
      fm(v, t, { freq: 130.8, ratio: 1.41, index: 250, indexDecay: 1.5, a: 0.01, d: 0.8, s: 0.35, r: 2, gain: 0.35 });
      return fm(v, t, { freq: 196, ratio: 2.76, index: 120, indexDecay: 1, a: 0.01, d: 0.6, s: 0.25, r: 1.8, gain: 0.18 });
    },
  },

  // ── Turn, timing & match ─────────────────────────────────────────────
  yourTurn: {
    group: "alerts",
    build: (v, t) => {
      tone(v, t, { type: "triangle", freq: 1046, d: 0.35, gain: 0.3 });
      return tone(v, t + 0.28, { type: "triangle", freq: 784, d: 0.45, gain: 0.3 });
    },
  },
  timerWarning: {
    group: "alerts",
    build: (v, t) =>
      seq(t, 2, 0.25, (tt, i) => tone(v, tt, { freq: at([2000, 1500], i), d: 0.012, r: 0.02, gain: 0.3 })),
  },
  timerExpired: {
    group: "alerts",
    build: (v, t) =>
      tone(v, t, { type: "square", freq: 110, a: 0.01, d: 0.05, s: 0.8, hold: 0.3, r: 0.08, gain: 0.25, lp: 500 }),
  },
  matchStart: {
    group: "alerts",
    build: (v, t) =>
      seq(t, 4, 0.04, (tt, i) =>
        tone(v, tt, { type: "triangle", freq: at([392, 493.9, 587.3, 784], i), d: 0.5 + i * 0.1, gain: 0.2 }),
      ),
  },
  victory: {
    group: "alerts",
    build: (v, t) =>
      seq(t, 4, 0.09, (tt, i) => {
        const freq = at([261.6, 329.6, 392, 523.3], i);
        const d = i === 3 ? 0.7 : 0.15;
        tone(v, tt, { type: "sawtooth", freq, d, r: 0.2, gain: 0.14, lp: 2000 });
        return tone(v, tt, { type: "triangle", freq, d, r: 0.2, gain: 0.2 });
      }),
  },
  defeat: {
    group: "alerts",
    build: (v, t) =>
      seq(t, 4, 0.22, (tt, i) => {
        const freq = at([392, 349.2, 311.1, 261.6], i);
        tone(v, tt, { freq, d: 0.4, r: 0.3, gain: 0.2 });
        return tone(v, tt, { type: "triangle", freq: freq / 2, d: 0.4, r: 0.4, gain: 0.15, lp: 900 });
      }),
  },

  // ── Multiplayer & social ─────────────────────────────────────────────
  playerJoined: {
    group: "alerts",
    build: (v, t) => seq(t, 2, 0.13, (tt, i) => tone(v, tt, { freq: at([523, 784], i), d: 0.12, gain: 0.25 })),
  },
  playerLeft: {
    group: "alerts",
    build: (v, t) => seq(t, 2, 0.13, (tt, i) => tone(v, tt, { freq: at([784, 523], i), d: 0.12, gain: 0.25 })),
  },
  invite: {
    group: "alerts",
    build: (v, t) =>
      seq(t, 3, 0.1, (tt, i) => tone(v, tt, { type: "triangle", freq: at([659, 830, 987], i), d: 0.3, gain: 0.22 })),
  },
  consent: {
    group: "alerts",
    build: (v, t) => {
      tone(v, t, { type: "triangle", freq: 880, a: 0.02, d: 0.1, s: 0.6, hold: 0.2, r: 0.15, gain: 0.2 });
      return tone(v, t, { type: "triangle", freq: 1108, a: 0.02, d: 0.1, s: 0.6, hold: 0.2, r: 0.15, gain: 0.14 });
    },
  },

  // ── Interface & draft ────────────────────────────────────────────────
  targetLock: {
    group: "interface",
    build: (v, t) => seq(t, 2, 0.08, (tt) => tone(v, tt, { freq: 1200, d: 0.02, gain: 0.25 })),
  },
  denied: {
    group: "interface",
    build: (v, t) =>
      seq(t, 2, 0.09, (tt, i) => tone(v, tt, { type: "square", freq: at([150, 120], i), d: 0.07, gain: 0.22, lp: 900 })),
  },
  pick: {
    group: "interface",
    build: (v, t) => {
      tone(v, t, { freq: 1046, d: 0.04, gain: 0.25 });
      return tone(v, t + 0.06, { freq: 1318, d: 0.07, gain: 0.25 });
    },
  },
  packPassed: {
    group: "interface",
    build: (v, t) => noise(v, t, { freq: 800, to: 3000, q: 1.5, a: 0.03, d: 0.25, gain: 0.3 }),
  },
} satisfies Record<string, SynthPatch>;

export type SynthSoundId = keyof typeof SYNTH_PATCHES;

export function isSynthSoundId(id: string): id is SynthSoundId {
  return Object.prototype.hasOwnProperty.call(SYNTH_PATCHES, id);
}

// ─── Shared audio context ────────────────────────────────────────────────

let sharedContext: AudioContext | null = null;
let masterInput: AudioNode | null = null;
let unlockArmed = false;

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  if (typeof AudioContext !== "undefined") return AudioContext;
  const w = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return w.webkitAudioContext ?? null;
}

function armUnlock(ctx: AudioContext): void {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const unlock = () => {
    if (ctx.state !== "suspended") {
      window.removeEventListener("pointerup", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      unlockArmed = false;
      return;
    }
    void ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerup", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

/**
 * The one AudioContext shared by synthesized effects and pitch-shifted clips.
 * Created lazily; resumes on the first user gesture if the browser starts it
 * suspended.
 */
export function getSharedAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const Ctor = audioContextConstructor();
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
  } catch {
    return null;
  }
  if (sharedContext.state === "suspended") armUnlock(sharedContext);
  return sharedContext;
}

/** Master bus for synthesized effects: a gentle compressor so stacks never clip. */
function getMasterInput(ctx: AudioContext): AudioNode {
  if (masterInput) return masterInput;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  compressor.connect(ctx.destination);
  masterInput = compressor;
  return compressor;
}

/**
 * True when audio scheduled now will be heard now. A suspended context only
 * counts while a user gesture is in progress (it resumes within the gesture);
 * otherwise sounds would pile up and all fire at once on the next click.
 */
export function canPlayNow(ctx: AudioContext): boolean {
  if (ctx.state === "running") return true;
  if (ctx.state === "closed") return false;
  void ctx.resume().catch(() => {});
  const activation = typeof navigator !== "undefined" ? navigator.userActivation : undefined;
  return activation ? activation.isActive : false;
}

export type SynthPlayback = {
  /** Per-sound gain node; ramp it to zero to cut the sound short. */
  bus: GainNode;
  /** AudioContext time the sound ends. */
  endsAt: number;
};

/** Schedule a synthesized patch on the shared context. */
export function playSynthPatch(
  id: SynthSoundId,
  options: { gain: number; cents: number },
): SynthPlayback | null {
  const ctx = getSharedAudioContext();
  if (!ctx || !canPlayNow(ctx)) return null;
  const bus = ctx.createGain();
  bus.gain.value = Math.max(0, options.gain);
  bus.connect(getMasterInput(ctx));
  const patch: SynthPatch = SYNTH_PATCHES[id];
  try {
    const endsAt = patch.build({ ctx, out: bus, cents: options.cents }, ctx.currentTime + 0.01);
    const lifetimeMs = Math.max(0, (endsAt - ctx.currentTime) * 1000) + 200;
    setTimeout(() => {
      try {
        bus.disconnect();
      } catch {}
    }, lifetimeMs);
    return { bus, endsAt };
  } catch {
    try {
      bus.disconnect();
    } catch {}
    return null;
  }
}
