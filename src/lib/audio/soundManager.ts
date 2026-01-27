export type SoundEffectId = keyof typeof SOUND_SOURCES;

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

const DEFAULT_VOLUME = 0.7;

// One semitone = 2^(1/12)
const SEMITONE_RATIO = Math.pow(2, 1 / 12);
// Reset pitch after 10 seconds of inactivity
const PITCH_RESET_MS = 10000;

function clampVolume(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

class SoundManager {
  private volume = DEFAULT_VOLUME;
  private audioCache: Map<SoundEffectId, HTMLAudioElement> = new Map();
  private autoplayGatePassed = false;

  // Web Audio API for pitch-shifted playback
  private audioContext: AudioContext | null = null;
  private audioBufferCache: Map<SoundEffectId, AudioBuffer> = new Map();
  private bufferLoadingPromises: Map<SoundEffectId, Promise<AudioBuffer | null>> =
    new Map();

  // Track successive clicks for pitch shifting (health sounds)
  private healthPlusClicks = 0;
  private healthMinusClicks = 0;
  private healthPlusResetTimer: ReturnType<typeof setTimeout> | null = null;
  private healthMinusResetTimer: ReturnType<typeof setTimeout> | null = null;

  getVolume(): number {
    return this.volume;
  }

  setVolume(value: number): void {
    this.volume = clampVolume(value);
    for (const audio of this.audioCache.values()) {
      audio.volume = this.volume;
    }
  }

  markAutoplayGatePassed(): void {
    this.autoplayGatePassed = true;
  }

  preload(effect: SoundEffectId): void {
    const audio = this.getOrCreateAudio(effect);
    if (!audio) return;
    audio.load();
    // Also preload into Web Audio buffer for pitch-shifted sounds
    if (effect === "healthPlus" || effect === "healthMinus") {
      void this.getOrLoadAudioBuffer(effect);
    }
  }

  play(effect: SoundEffectId): void {
    if (!this.autoplayGatePassed) {
      // Attempt to play once regardless; if it succeeds we mark the gate as passed
      this.autoplayGatePassed = true;
    }

    if (typeof window === "undefined") return;
    if (this.volume <= 0) return;

    // Use pitch-shifted playback for health sounds
    if (effect === "healthPlus") {
      this.playHealthSound("plus");
      return;
    }
    if (effect === "healthMinus") {
      this.playHealthSound("minus");
      return;
    }

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

    void audio.play().catch(() => {
      // Ignore play promise rejections (common when user interaction is required)
    });
  }

  private playHealthSound(direction: "plus" | "minus"): void {
    const effect: SoundEffectId =
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
    effect: SoundEffectId,
    playbackRate: number,
  ): Promise<void> {
    if (typeof window === "undefined") return;

    // Initialize AudioContext on demand (requires user gesture)
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext();
      } catch {
        // Fallback to normal play if Web Audio API unavailable
        this.playFallback(effect);
        return;
      }
    }

    // Resume context if suspended (autoplay policy)
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        this.playFallback(effect);
        return;
      }
    }

    const buffer = await this.getOrLoadAudioBuffer(effect);
    if (!buffer) {
      this.playFallback(effect);
      return;
    }

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      source.start(0);
    } catch {
      this.playFallback(effect);
    }
  }

  private async getOrLoadAudioBuffer(
    effect: SoundEffectId,
  ): Promise<AudioBuffer | null> {
    // Return cached buffer
    const cached = this.audioBufferCache.get(effect);
    if (cached) return cached;

    // Return existing loading promise
    const existingPromise = this.bufferLoadingPromises.get(effect);
    if (existingPromise) return existingPromise;

    // Load the audio buffer
    const loadPromise = this.loadAudioBuffer(effect);
    this.bufferLoadingPromises.set(effect, loadPromise);

    const buffer = await loadPromise;
    this.bufferLoadingPromises.delete(effect);

    if (buffer) {
      this.audioBufferCache.set(effect, buffer);
    }

    return buffer;
  }

  private async loadAudioBuffer(
    effect: SoundEffectId,
  ): Promise<AudioBuffer | null> {
    if (!this.audioContext) return null;

    try {
      const response = await fetch(SOUND_SOURCES[effect]);
      const arrayBuffer = await response.arrayBuffer();
      return await this.audioContext.decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }

  private playFallback(effect: SoundEffectId): void {
    // Fallback to HTMLAudioElement without pitch shifting
    const base = this.getOrCreateAudio(effect);
    if (!base) return;

    const audio = base.paused
      ? base
      : (base.cloneNode(true) as HTMLAudioElement);
    audio.volume = this.volume;
    if (audio === base) {
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore
      }
    }
    void audio.play().catch(() => {});
  }

  private getOrCreateAudio(effect: SoundEffectId): HTMLAudioElement | null {
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
export const DEFAULT_SOUND_VOLUME = DEFAULT_VOLUME;
export const SOUND_EFFECTS = SOUND_SOURCES;
