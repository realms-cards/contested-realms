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
  }

  play(effect: SoundEffectId): void {
    if (!this.autoplayGatePassed) {
      // Attempt to play once regardless; if it succeeds we mark the gate as passed
      this.autoplayGatePassed = true;
    }

    if (typeof window === "undefined") return;
    if (this.volume <= 0) return;

    const base = this.getOrCreateAudio(effect);
    if (!base) return;

    const audio = base.paused ? base : (base.cloneNode(true) as HTMLAudioElement);
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
