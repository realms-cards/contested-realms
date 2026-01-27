'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SOUND_VOLUME,
  SOUND_EFFECTS,
  SOUND_VOLUME_STORAGE_KEY,
  soundManager,
  type SoundEffectId,
} from "@/lib/audio/soundManager";

export type SoundContextValue = {
  volume: number;
  setVolume: (value: number) => void;
  play: (effect: SoundEffectId) => void;
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

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [volume, setVolumeState] = useState<number>(DEFAULT_SOUND_VOLUME);

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
    } catch {
      // Ignore storage errors (private mode, etc.)
    }
  }, []);

  useEffect(() => {
    soundManager.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    (Object.keys(SOUND_EFFECTS) as SoundEffectId[]).forEach((effect) => {
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

  const play = useCallback((effect: SoundEffectId) => {
    soundManager.play(effect);
  }, []);

  const value = useMemo<SoundContextValue>(() => ({
    volume,
    setVolume,
    play,
    playCardFlip: () => play("cardFlip"),
    playCardPlay: () => play("cardPlay"),
    playCardSelect: () => play("cardSelect"),
    playCardShuffle: () => play("cardShuffle"),
    playPing: () => play("ping"),
    playTurnGong: () => play("turnGong"),
    playHealthPlus: () => play("healthPlus"),
    playHealthMinus: () => play("healthMinus"),
  }), [play, setVolume, volume]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const ctx = React.useContext(SoundContext);
  if (!ctx) {
    throw new Error("useSound must be used within <SoundProvider>");
  }
  return ctx;
}
