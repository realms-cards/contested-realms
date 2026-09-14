import {
  getSharedAudioContext,
  isSynthSoundId,
  playSynthPatch,
  SYNTH_PATCHES,
  type SfxActor,
  type SfxGroup,
  type SynthPlayback,
  type SynthSoundId,
} from "@/lib/audio/synth";

export type { SfxActor, SfxGroup } from "@/lib/audio/synth";

const SOUND_SOURCES = {
  cardFlip: "/sounds/card-flip.wav",
  cardPlay: "/sounds/card-play.wav",
  cardSelect: "/sounds/card-select.wav",
  cardShuffle: "/sounds/card-shuffle.wav",
  ping: "/sounds/ping.wav",
  turnGong: "/sounds/gong.wav",
  healthPlus: "/sounds/healthplus.wav",
  healthMinus: "/sounds/healthminus.wav",
} as const;

/** Sounds played from recorded clips in /public/sounds. */
export type ClipSoundId = keyof typeof SOUND_SOURCES;

/** Every sound the game can play: recorded clips and synthesized patches. */
export type SoundEffectId = ClipSoundId | SynthSoundId;

const CLIP_GROUPS: Record<ClipSoundId, SfxGroup> = {
  cardFlip: "board",
  cardPlay: "board",
  cardSelect: "interface",
  cardShuffle: "board",
  ping: "alerts",
  turnGong: "alerts",
  healthPlus: "board",
  healthMinus: "board",
};

export type SfxMix = Record<SfxGroup, boolean>;

export const DEFAULT_SFX_MIX: SfxMix = {
  board: true,
  alerts: true,
  interface: true,
};

/** Repeats of the same ladder key within the reset window climb or fall a semitone each. */
export type SfxLadder = { key: string; step: 1 | -1 };

export type PlayOptions = {
  actor?: SfxActor;
  ladder?: SfxLadder;
};

const DEFAULT_VOLUME = 0.7;

// One semitone = 2^(1/12)
const SEMITONE_RATIO = Math.pow(2, 1 / 12);
// Reset pitch after 10 seconds of inactivity
const PITCH_RESET_MS = 10000;
// The same sound from the same actor within this window plays once.
const COALESCE_MS = 40;
// Simultaneous synthesized sounds; the oldest (interface first) is cut beyond this.
const MAX_VOICES = 12;
// Opponent actions: three semitones lower, slightly quieter.
const OPPONENT_CENTS = -300;
const OPPONENT_GAIN = 0.8;

function clampVolume(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function soundGroup(effect: SoundEffectId): SfxGroup {
  return isSynthSoundId(effect) ? SYNTH_PATCHES[effect].group : CLIP_GROUPS[effect];
}

type ActiveVoice = SynthPlayback & { group: SfxGroup };

type LadderState = { count: number; timer: ReturnType<typeof setTimeout> | null };

class SoundManager {
  private volume = DEFAULT_VOLUME;
  private mix: SfxMix = { ...DEFAULT_SFX_MIX };
  private audioCache: Map<ClipSoundId, HTMLAudioElement> = new Map();
  private autoplayGatePassed = false;

  // Web Audio buffers for pitch-shifted clip playback (health sounds)
  private audioBufferCache: Map<ClipSoundId, AudioBuffer> = new Map();
  private bufferLoadingPromises: Map<ClipSoundId, Promise<AudioBuffer | null>> =
    new Map();

  // Track successive clicks for pitch shifting (health sounds)
  private healthPlusClicks = 0;
  private healthMinusClicks = 0;
  private healthPlusResetTimer: ReturnType<typeof setTimeout> | null = null;
  private healthMinusResetTimer: ReturnType<typeof setTimeout> | null = null;

  private lastPlayedAt: Map<string, number> = new Map();
  private ladders: Map<string, LadderState> = new Map();
  private voices: ActiveVoice[] = [];
  private listeners: Set<(effect: SoundEffectId, actor: SfxActor) => void> = new Set();

  getVolume(): number {
    return this.volume;
  }

  setVolume(value: number): void {
    this.volume = clampVolume(value);
    for (const audio of this.audioCache.values()) {
      audio.volume = this.volume;
    }
  }

  getMix(): SfxMix {
    return { ...this.mix };
  }

  setMix(mix: SfxMix): void {
    this.mix = { ...mix };
  }

  markAutoplayGatePassed(): void {
    this.autoplayGatePassed = true;
  }

  /** Observe every sound that actually starts (development tooling and tests). */
  onPlay(listener: (effect: SoundEffectId, actor: SfxActor) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  preload(effect: ClipSoundId): void {
    const audio = this.getOrCreateAudio(effect);
    if (!audio) return;
    audio.load();
  }

  play(effect: SoundEffectId, options: PlayOptions = {}): void {
    if (!this.autoplayGatePassed) {
      // Attempt to play once regardless; if it succeeds we mark the gate as passed
      this.autoplayGatePassed = true;
    }

    if (typeof window === "undefined") return;
    if (this.volume <= 0) return;

    const group = soundGroup(effect);
    if (!this.mix[group]) return;
    // Only alerts are worth hearing while the tab is in the background.
    if (group !== "alerts" && typeof document !== "undefined" && document.hidden) {
      return;
    }

    const actor = options.actor ?? "me";

    // Health sounds keep their original clip path, including the pitch ladder.
    if (effect === "healthPlus") {
      this.emit(effect, actor);
      this.playHealthSound("plus");
      return;
    }
    if (effect === "healthMinus") {
      this.emit(effect, actor);
      this.playHealthSound("minus");
      return;
    }

    const coalesceKey = `${effect}:${actor}`;
    const now = Date.now();
    const last = this.lastPlayedAt.get(coalesceKey);
    if (last !== undefined && now - last < COALESCE_MS) return;
    this.lastPlayedAt.set(coalesceKey, now);

    if (isSynthSoundId(effect)) {
      this.playSynth(effect, actor, options.ladder);
      return;
    }

    this.emit(effect, actor);
    this.playClip(effect);
  }

  private emit(effect: SoundEffectId, actor: SfxActor): void {
    for (const listener of this.listeners) {
      try {
        listener(effect, actor);
      } catch {}
    }
  }

  private playSynth(effect: SynthSoundId, actor: SfxActor, ladder?: SfxLadder): void {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    this.voices = this.voices.filter((voice) => voice.endsAt > ctx.currentTime);
    if (this.voices.length >= MAX_VOICES) {
      const victimIndex = Math.max(
        this.voices.findIndex((voice) => voice.group === "interface"),
        0,
      );
      const [victim] = this.voices.splice(victimIndex, 1);
      if (victim) {
        try {
          victim.bus.gain.cancelScheduledValues(ctx.currentTime);
          victim.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
        } catch {}
      }
    }

    const ladderCents = ladder ? this.advanceLadder(ladder) * 100 : 0;
    const playback = playSynthPatch(effect, {
      gain: this.volume * (actor === "opponent" ? OPPONENT_GAIN : 1),
      cents: (actor === "opponent" ? OPPONENT_CENTS : 0) + ladderCents,
    });
    if (!playback) return;

    const group = SYNTH_PATCHES[effect].group;
    this.voices.push({ ...playback, group });
    this.emit(effect, actor);

    if (group === "alerts" && typeof window !== "undefined") {
      const seconds = Math.max(0.2, playback.endsAt - ctx.currentTime);
      try {
        window.dispatchEvent(new CustomEvent("sfx:duck", { detail: { seconds } }));
      } catch {}
    }
  }

  /** Returns the semitone offset for this repeat of the ladder. */
  private advanceLadder(ladder: SfxLadder): number {
    const state = this.ladders.get(ladder.key) ?? { count: 0, timer: null };
    state.count += 1;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      this.ladders.delete(ladder.key);
    }, PITCH_RESET_MS);
    this.ladders.set(ladder.key, state);
    return (state.count - 1) * ladder.step;
  }

  private playClip(effect: ClipSoundId): void {
    const base = this.getOrCreateAudio(effect);
    if (!base) return;

    const audio = base.paused
      ? base
      : (base.cloneNode(true) as HTMLAudioElement);
    audio.volume = this.volume;
    // Force restart when reusing the same element
    if (audio === base) {
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore DOM exceptions when resetting currentTime on unready audio elements
      }
    }

    const result = audio.play();
    if (result) {
      void result.catch(() => {
        // Ignore play promise rejections (common when user interaction is required)
      });
    }
  }

  private playHealthSound(direction: "plus" | "minus"): void {
    const effect: ClipSoundId =
      direction === "plus" ? "healthPlus" : "healthMinus";

    // Update click count and reset timer
    if (direction === "plus") {
      this.healthPlusClicks++;
      if (this.healthPlusResetTimer) {
        clearTimeout(this.healthPlusResetTimer);
      }
      this.healthPlusResetTimer = setTimeout(() => {
        this.healthPlusClicks = 0;
        this.healthPlusResetTimer = null;
      }, PITCH_RESET_MS);
    } else {
      this.healthMinusClicks++;
      if (this.healthMinusResetTimer) {
        clearTimeout(this.healthMinusResetTimer);
      }
      this.healthMinusResetTimer = setTimeout(() => {
        this.healthMinusClicks = 0;
        this.healthMinusResetTimer = null;
      }, PITCH_RESET_MS);
    }

    // Calculate pitch shift: +1 semitone per click for plus, -1 for minus
    // First click is at normal pitch (clicks=1 means 0 semitones shift)
    const clicks =
      direction === "plus" ? this.healthPlusClicks : this.healthMinusClicks;
    const semitoneShift = direction === "plus" ? clicks - 1 : -(clicks - 1);
    const playbackRate = Math.pow(SEMITONE_RATIO, semitoneShift);

    // Try Web Audio API for pitch shifting
    void this.playWithPitch(effect, playbackRate);
  }

  private async playWithPitch(
    effect: ClipSoundId,
    playbackRate: number,
  ): Promise<void> {
    if (typeof window === "undefined") return;

    const audioContext = getSharedAudioContext();
    if (!audioContext) {
      this.playClip(effect);
      return;
    }

    // Resume context if suspended (autoplay policy)
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        this.playClip(effect);
        return;
      }
    }

    const buffer = await this.getOrLoadAudioBuffer(effect, audioContext);
    if (!buffer) {
      this.playClip(effect);
      return;
    }

    try {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      source.start(0);
    } catch {
      this.playClip(effect);
    }
  }

  private async getOrLoadAudioBuffer(
    effect: ClipSoundId,
    audioContext: AudioContext,
  ): Promise<AudioBuffer | null> {
    // Return cached buffer
    const cached = this.audioBufferCache.get(effect);
    if (cached) return cached;

    // Return existing loading promise
    const existingPromise = this.bufferLoadingPromises.get(effect);
    if (existingPromise) return existingPromise;

    // Load the audio buffer
    const loadPromise = this.loadAudioBuffer(effect, audioContext);
    this.bufferLoadingPromises.set(effect, loadPromise);

    const buffer = await loadPromise;
    this.bufferLoadingPromises.delete(effect);

    if (buffer) {
      this.audioBufferCache.set(effect, buffer);
    }

    return buffer;
  }

  private async loadAudioBuffer(
    effect: ClipSoundId,
    audioContext: AudioContext,
  ): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(SOUND_SOURCES[effect]);
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }

  private getOrCreateAudio(effect: ClipSoundId): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;

    let audio = this.audioCache.get(effect);
    if (!audio) {
      audio = new Audio(SOUND_SOURCES[effect]);
      audio.preload = "auto";
      audio.volume = this.volume;
      this.audioCache.set(effect, audio);
    }

    return audio;
  }
}

export const soundManager = new SoundManager();
export const SOUND_VOLUME_STORAGE_KEY = "sorcery:soundVolume";
export const SFX_MIX_STORAGE_KEY = "sorcery:sfxMix";
export const DEFAULT_SOUND_VOLUME = DEFAULT_VOLUME;
/** Recorded clips only; synthesized patches need no preloading. */
export const SOUND_EFFECTS = SOUND_SOURCES;

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  // Dev handle for driving and observing sounds from the browser console.
  (window as unknown as Record<string, unknown>).__sfx = soundManager;
}
