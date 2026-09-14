'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SFX_MIX,
  DEFAULT_SOUND_VOLUME,
  SFX_MIX_STORAGE_KEY,
  SOUND_EFFECTS,
  SOUND_VOLUME_STORAGE_KEY,
  soundManager,
  type ClipSoundId,
  type PlayOptions,
  type SfxGroup,
  type SfxMix,
  type SoundEffectId,
} from "@/lib/audio/soundManager";

export type SoundContextValue = {
  volume: number;
  setVolume: (value: number) => void;
  /** Which sound groups are enabled (board, alerts, interface). */
  mix: SfxMix;
  setMixGroup: (group: SfxGroup, enabled: boolean) => void;
  play: (effect: SoundEffectId, options?: PlayOptions) => void;
  playCardFlip: () => void;
  playCardPlay: () => void;
  playCardSelect: () => void;
  playCardShuffle: () => void;
  playPing: () => void;
  playTurnGong: () => void;
  playHealthPlus: () => void;
  playHealthMinus: () => void;
};

const SoundContext = React.createContext<SoundContextValue | undefined>(undefined);

function parseMix(raw: string | null): SfxMix | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const mix: SfxMix = { ...DEFAULT_SFX_MIX };
    for (const group of Object.keys(DEFAULT_SFX_MIX) as SfxGroup[]) {
      if (typeof record[group] === "boolean") mix[group] = record[group];
    }
    return mix;
  } catch {
    return null;
  }
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [volume, setVolumeState] = useState<number>(DEFAULT_SOUND_VOLUME);
  const [mix, setMixState] = useState<SfxMix>(DEFAULT_SFX_MIX);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(SOUND_VOLUME_STORAGE_KEY);
      if (stored != null) {
        const parsed = Number.parseFloat(stored);
        if (!Number.isNaN(parsed)) {
          const clamped = Math.min(Math.max(parsed, 0), 1);
          setVolumeState(clamped);
          soundManager.setVolume(clamped);
        }
      }
      const storedMix = parseMix(window.localStorage.getItem(SFX_MIX_STORAGE_KEY));
      if (storedMix) {
        setMixState(storedMix);
        soundManager.setMix(storedMix);
      }
    } catch {
      // Ignore storage errors (private mode, etc.)
    }
  }, []);

  useEffect(() => {
    soundManager.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    soundManager.setMix(mix);
  }, [mix]);

  useEffect(() => {
    (Object.keys(SOUND_EFFECTS) as ClipSoundId[]).forEach((effect) => {
      soundManager.preload(effect);
    });
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1);
    soundManager.setVolume(clamped);
    setVolumeState(clamped);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, clamped.toString());
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setMixGroup = useCallback((group: SfxGroup, enabled: boolean) => {
    setMixState((prev) => {
      const next: SfxMix = { ...prev, [group]: enabled };
      soundManager.setMix(next);
      try {
        window.localStorage.setItem(SFX_MIX_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const play = useCallback((effect: SoundEffectId, options?: PlayOptions) => {
    soundManager.play(effect, options);
  }, []);

  const value = useMemo<SoundContextValue>(() => ({
    volume,
    setVolume,
    mix,
    setMixGroup,
    play,
    playCardFlip: () => play("cardFlip"),
    playCardPlay: () => play("cardPlay"),
    playCardSelect: () => play("cardSelect"),
    playCardShuffle: () => play("cardShuffle"),
    playPing: () => play("ping"),
    playTurnGong: () => play("turnGong"),
    playHealthPlus: () => play("healthPlus"),
    playHealthMinus: () => play("healthMinus"),
  }), [mix, play, setMixGroup, setVolume, volume]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const ctx = React.useContext(SoundContext);
  if (!ctx) {
    throw new Error("useSound must be used within <SoundProvider>");
  }
  return ctx;
}
