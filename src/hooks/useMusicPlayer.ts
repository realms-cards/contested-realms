/**
 * useMusicPlayer Hook
 *
 * Manages background music playback during gameplay with persistent settings.
 * Uses a module-level singleton audio element so all consumers share one player
 * (prevents double-play when multiple components call useMusicPlayer).
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  MUSIC_TRACKS,
  MUSIC_DEFAULTS,
  MUSIC_STORAGE_KEYS,
  getTrackByIndex,
  getNextTrackIndex,
  getPreviousTrackIndex,
  getStartingTrackIndex,
  selectTrackForGameState,
  type MusicTrack,
  type MusicMood,
} from "@/lib/music/music-config";

interface GameMusicState {
  currentHealth: number;
  isDeathsDoor: boolean;
  recentHealthChange: number;
}

interface MusicPlayerState {
  /** Current track being played */
  currentTrack: MusicTrack;
  /** Current track index in playlist */
  currentTrackIndex: number;
  /** Whether music is currently playing */
  isPlaying: boolean;
  /** Whether music player is enabled */
  isEnabled: boolean;
  /** Current volume (0-1) */
  volume: number;
  /** Whether player UI is expanded */
  isExpanded: boolean;
  /** Whether browser blocked autoplay */
  autoplayBlocked: boolean;
  /** Current track's mood category */
  currentMood: MusicMood;
}

interface MusicPlayerControls {
  /** Toggle play/pause */
  togglePlay: () => void;
  /** Set volume (0-1) */
  setVolume: (volume: number) => void;
  /** Skip to next track */
  nextTrack: () => void;
  /** Skip to previous track */
  previousTrack: () => void;
  /** Select specific track by index */
  selectTrack: (index: number) => void;
  /** Toggle enabled/disabled state */
  toggleEnabled: () => void;
  /** Toggle expanded/collapsed state */
  toggleExpanded: () => void;
  /** Set expanded state explicitly */
  setExpanded: (expanded: boolean) => void;
  /** Update game state for mood-based track selection */
  updateGameState: (
    currentHealth: number,
    isDeathsDoor: boolean,
    recentHealthChange: number
  ) => void;
  /** Reset to starting track (for new matches) */
  resetToStartingTrack: () => void;
}

/**
 * Load a setting from localStorage with fallback to default
 */
function loadSetting<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;

    // Handle boolean strings
    if (typeof defaultValue === "boolean") {
      return (stored === "true") as T;
    }

    // Handle numbers
    if (typeof defaultValue === "number") {
      const parsed = parseFloat(stored);
      return (isNaN(parsed) ? defaultValue : parsed) as T;
    }

    return stored as T;
  } catch (error) {
    console.error(`Failed to load setting ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Save a setting to localStorage
 */
function saveSetting<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.error(`Failed to save setting ${key}:`, error);
  }
}

// ─── Singleton music store ───────────────────────────────────────────────
// All state lives at module scope so every useMusicPlayer() consumer
// shares one audio element and one set of state values.

interface SingletonState {
  isEnabled: boolean;
  isPlaying: boolean;
  volume: number;
  isExpanded: boolean;
  currentTrackIndex: number;
  autoplayBlocked: boolean;
}

let singletonAudio: HTMLAudioElement | null = null;
let shouldBePlaying = false;
const gameState: GameMusicState = {
  currentHealth: 20,
  isDeathsDoor: false,
  recentHealthChange: 0,
};

// Subscriber list for useSyncExternalStore
const listeners = new Set<() => void>();
function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

// Current snapshot (replaced on every state change to trigger re-renders)
let snapshot: SingletonState = {
  isEnabled: typeof window !== "undefined"
    ? loadSetting(MUSIC_STORAGE_KEYS.enabled, MUSIC_DEFAULTS.enabled)
    : MUSIC_DEFAULTS.enabled,
  isPlaying: false,
  volume: typeof window !== "undefined"
    ? loadSetting(MUSIC_STORAGE_KEYS.volume, MUSIC_DEFAULTS.volume)
    : MUSIC_DEFAULTS.volume,
  isExpanded: typeof window !== "undefined"
    ? loadSetting(MUSIC_STORAGE_KEYS.expanded, MUSIC_DEFAULTS.expanded)
    : MUSIC_DEFAULTS.expanded,
  currentTrackIndex: typeof window !== "undefined"
    ? loadSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, 0)
    : 0,
  autoplayBlocked: false,
};

// SSR snapshot (stable reference)
const serverSnapshot: SingletonState = {
  isEnabled: MUSIC_DEFAULTS.enabled,
  isPlaying: false,
  volume: MUSIC_DEFAULTS.volume,
  isExpanded: MUSIC_DEFAULTS.expanded,
  currentTrackIndex: 0,
  autoplayBlocked: false,
};

function updateSnapshot(partial: Partial<SingletonState>) {
  snapshot = { ...snapshot, ...partial };
  emitChange();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return serverSnapshot;
}

/** Ensure the singleton audio element exists (browser only) */
function ensureAudio(): HTMLAudioElement {
  if (!singletonAudio) {
    singletonAudio = new Audio();
    singletonAudio.preload = "auto";
    singletonAudio.volume = snapshot.volume;

    // Set initial source
    const track = getTrackByIndex(snapshot.currentTrackIndex);
    singletonAudio.src = track.path;

    // Handle track end — select next track based on game state mood
    singletonAudio.addEventListener("ended", () => {
      const nextIndex = selectTrackForGameState(
        gameState.currentHealth,
        gameState.isDeathsDoor,
        gameState.recentHealthChange,
        snapshot.currentTrackIndex,
      );
      changeTrack(nextIndex);
    });

    // Handle errors — skip to next track
    singletonAudio.addEventListener("error", () => {
      const nextIndex = selectTrackForGameState(
        gameState.currentHealth,
        gameState.isDeathsDoor,
        gameState.recentHealthChange,
        snapshot.currentTrackIndex,
      );
      changeTrack(nextIndex);
    });
  }
  return singletonAudio;
}

function changeTrack(index: number) {
  const audio = ensureAudio();
  const track = getTrackByIndex(index);
  audio.src = track.path;
  saveSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, index);

  if (shouldBePlaying && snapshot.isEnabled) {
    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          updateSnapshot({ currentTrackIndex: index, isPlaying: true });
        })
        .catch(() => {
          shouldBePlaying = false;
          updateSnapshot({ currentTrackIndex: index, isPlaying: false, autoplayBlocked: true });
        });
    }
  } else {
    updateSnapshot({ currentTrackIndex: index });
  }
}

function tryPlay() {
  const audio = ensureAudio();
  shouldBePlaying = true;
  const playPromise = audio.play();
  if (playPromise) {
    playPromise
      .then(() => {
        updateSnapshot({ isPlaying: true, autoplayBlocked: false });
      })
      .catch(() => {
        shouldBePlaying = false;
        updateSnapshot({ isPlaying: false, autoplayBlocked: true });
      });
  }
}

// Track how many hook instances are mounted so we know when to clean up
let mountCount = 0;

export function useMusicPlayer(): [MusicPlayerState, MusicPlayerControls] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Track whether this instance has already triggered the initial auto-play
  const didAutoPlayRef = useRef(false);

  // On first mount (browser only), ensure audio element exists and auto-play if enabled
  useEffect(() => {
    mountCount++;
    ensureAudio();

    // Auto-play on first mount if enabled (only once across all consumers)
    if (state.isEnabled && !didAutoPlayRef.current) {
      didAutoPlayRef.current = true;
      tryPlay();
    }

    return () => {
      mountCount--;
      // When no consumers remain, pause and clean up
      if (mountCount <= 0) {
        mountCount = 0;
        if (singletonAudio) {
          singletonAudio.pause();
          singletonAudio = null;
        }
        shouldBePlaying = false;
        updateSnapshot({ isPlaying: false });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTrack = getTrackByIndex(state.currentTrackIndex);

  // Controls
  const togglePlay = useCallback(() => {
    const audio = ensureAudio();

    if (audio.paused) {
      shouldBePlaying = true;
      saveSetting(MUSIC_STORAGE_KEYS.enabled, true);
      const playPromise = audio.play();
      if (playPromise) {
        playPromise
          .then(() => {
            updateSnapshot({ isEnabled: true, isPlaying: true, autoplayBlocked: false });
          })
          .catch(() => {
            shouldBePlaying = false;
            updateSnapshot({ autoplayBlocked: true });
          });
      }
    } else {
      shouldBePlaying = false;
      saveSetting(MUSIC_STORAGE_KEYS.enabled, false);
      audio.pause();
      updateSnapshot({ isEnabled: false, isPlaying: false });
    }
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    if (singletonAudio) singletonAudio.volume = clampedVolume;
    saveSetting(MUSIC_STORAGE_KEYS.volume, clampedVolume);
    updateSnapshot({ volume: clampedVolume });
  }, []);

  const nextTrack = useCallback(() => {
    const nextIndex = getNextTrackIndex(snapshot.currentTrackIndex);
    changeTrack(nextIndex);
  }, []);

  const previousTrack = useCallback(() => {
    const prevIndex = getPreviousTrackIndex(snapshot.currentTrackIndex);
    changeTrack(prevIndex);
  }, []);

  const selectTrack = useCallback((index: number) => {
    if (index < 0 || index >= MUSIC_TRACKS.length) {
      console.warn(`Invalid track index: ${index}`);
      return;
    }
    changeTrack(index);
  }, []);

  const toggleEnabled = useCallback(() => {
    const newEnabled = !snapshot.isEnabled;
    saveSetting(MUSIC_STORAGE_KEYS.enabled, newEnabled);

    if (newEnabled) {
      updateSnapshot({ isEnabled: true });
      tryPlay();
    } else {
      shouldBePlaying = false;
      if (singletonAudio) singletonAudio.pause();
      updateSnapshot({ isEnabled: false, isPlaying: false });
    }
  }, []);

  const toggleExpanded = useCallback(() => {
    const newExpanded = !snapshot.isExpanded;
    saveSetting(MUSIC_STORAGE_KEYS.expanded, newExpanded);
    updateSnapshot({ isExpanded: newExpanded });
  }, []);

  const setExpanded = useCallback((expanded: boolean) => {
    saveSetting(MUSIC_STORAGE_KEYS.expanded, expanded);
    updateSnapshot({ isExpanded: expanded });
  }, []);

  const updateGameState = useCallback(
    (
      currentHealth: number,
      isDeathsDoor: boolean,
      recentHealthChange: number,
    ) => {
      gameState.currentHealth = currentHealth;
      gameState.isDeathsDoor = isDeathsDoor;
      gameState.recentHealthChange = recentHealthChange;
    },
    [],
  );

  const resetToStartingTrack = useCallback(() => {
    const startingIndex = getStartingTrackIndex();
    gameState.currentHealth = 20;
    gameState.isDeathsDoor = false;
    gameState.recentHealthChange = 0;
    changeTrack(startingIndex);
  }, []);

  return [
    {
      currentTrack,
      currentTrackIndex: state.currentTrackIndex,
      isPlaying: state.isPlaying,
      isEnabled: state.isEnabled,
      volume: state.volume,
      isExpanded: state.isExpanded,
      autoplayBlocked: state.autoplayBlocked,
      currentMood: currentTrack.mood,
    },
    {
      togglePlay,
      setVolume,
      nextTrack,
      previousTrack,
      selectTrack,
      toggleEnabled,
      toggleExpanded,
      setExpanded,
      updateGameState,
      resetToStartingTrack,
    },
  ];
}
