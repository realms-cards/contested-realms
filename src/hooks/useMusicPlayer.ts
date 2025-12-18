/**
 * useMusicPlayer Hook
 *
 * Manages background music playback during gameplay with persistent settings.
 * Handles audio element lifecycle, playlist rotation, and localStorage persistence.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MUSIC_TRACKS,
  MUSIC_DEFAULTS,
  MUSIC_STORAGE_KEYS,
  getTrackByIndex,
  getNextTrackIndex,
  getPreviousTrackIndex,
  type MusicTrack,
} from "@/lib/music/music-config";

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

export function useMusicPlayer(): [MusicPlayerState, MusicPlayerControls] {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  // Track playback intent separately from audio.paused state
  // This ensures we continue playing after track ends
  const shouldBePlayingRef = useRef(false);

  // Load initial settings from localStorage
  const [isEnabled, setIsEnabled] = useState<boolean>(() =>
    loadSetting(MUSIC_STORAGE_KEYS.enabled, MUSIC_DEFAULTS.enabled)
  );
  const [volume, setVolumeState] = useState<number>(() =>
    loadSetting(MUSIC_STORAGE_KEYS.volume, MUSIC_DEFAULTS.volume)
  );
  const [isExpanded, setIsExpandedState] = useState<boolean>(() =>
    loadSetting(MUSIC_STORAGE_KEYS.expanded, MUSIC_DEFAULTS.expanded)
  );
  const [currentTrackIndex, setCurrentTrackIndexState] = useState<number>(() =>
    loadSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, 0)
  );
  const [isPlaying, setIsPlaying] = useState(false);

  const currentTrack = getTrackByIndex(currentTrackIndex);

  // Initialize audio element (runs once on mount)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Create audio element only once
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }

    // Handle track end - auto-advance to next track
    const handleEnded = () => {
      const nextIndex = getNextTrackIndex(currentTrackIndex);
      setCurrentTrackIndexState(nextIndex);
      saveSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, nextIndex);
    };

    // Handle audio errors - skip to next track
    const handleError = (e: ErrorEvent) => {
      console.error("Music playback error:", e);
      const nextIndex = getNextTrackIndex(currentTrackIndex);
      setCurrentTrackIndexState(nextIndex);
      saveSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, nextIndex);
    };

    audioRef.current.addEventListener("ended", handleEnded);
    audioRef.current.addEventListener("error", handleError as EventListener);

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener("ended", handleEnded);
        audioRef.current.removeEventListener(
          "error",
          handleError as EventListener
        );
      }
    };
  }, [currentTrackIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Update audio source when track changes
  useEffect(() => {
    if (!audioRef.current) return;

    // Use shouldBePlayingRef instead of audio.paused because when a track ends,
    // paused becomes true even though we want to continue playing the next track
    const wasPlaying = shouldBePlayingRef.current;
    audioRef.current.src = currentTrack.path;

    if (wasPlaying && isEnabled) {
      const playPromise = audioRef.current.play();
      if (playPromise) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((error) => {
            console.warn("Autoplay blocked or playback failed:", error);
            setAutoplayBlocked(true);
            setIsPlaying(false);
            shouldBePlayingRef.current = false;
          });
      }
    }
  }, [currentTrack, isEnabled]);

  // Auto-play when enabled
  useEffect(() => {
    if (!audioRef.current || !isEnabled) return;

    shouldBePlayingRef.current = true;
    const playPromise = audioRef.current.play();
    if (playPromise) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch((error) => {
          console.warn("Autoplay blocked:", error);
          setAutoplayBlocked(true);
          setIsPlaying(false);
          shouldBePlayingRef.current = false;
        });
    }
  }, [isEnabled]);

  // Update volume when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Controls
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      shouldBePlayingRef.current = true;
      const playPromise = audioRef.current.play();
      if (playPromise) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setAutoplayBlocked(false);
          })
          .catch((error) => {
            console.warn("Play failed:", error);
            setAutoplayBlocked(true);
            shouldBePlayingRef.current = false;
          });
      }
    } else {
      shouldBePlayingRef.current = false;
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
    saveSetting(MUSIC_STORAGE_KEYS.volume, clampedVolume);
  }, []);

  const nextTrack = useCallback(() => {
    const nextIndex = getNextTrackIndex(currentTrackIndex);
    setCurrentTrackIndexState(nextIndex);
    saveSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, nextIndex);
  }, [currentTrackIndex]);

  const previousTrack = useCallback(() => {
    const prevIndex = getPreviousTrackIndex(currentTrackIndex);
    setCurrentTrackIndexState(prevIndex);
    saveSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, prevIndex);
  }, [currentTrackIndex]);

  const selectTrack = useCallback((index: number) => {
    if (index < 0 || index >= MUSIC_TRACKS.length) {
      console.warn(`Invalid track index: ${index}`);
      return;
    }
    setCurrentTrackIndexState(index);
    saveSetting(MUSIC_STORAGE_KEYS.currentTrackIndex, index);
  }, []);

  const toggleEnabled = useCallback(() => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    saveSetting(MUSIC_STORAGE_KEYS.enabled, newEnabled);

    if (!newEnabled && audioRef.current) {
      shouldBePlayingRef.current = false;
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isEnabled]);

  const toggleExpanded = useCallback(() => {
    const newExpanded = !isExpanded;
    setIsExpandedState(newExpanded);
    saveSetting(MUSIC_STORAGE_KEYS.expanded, newExpanded);
  }, [isExpanded]);

  const setExpanded = useCallback((expanded: boolean) => {
    setIsExpandedState(expanded);
    saveSetting(MUSIC_STORAGE_KEYS.expanded, expanded);
  }, []);

  return [
    {
      currentTrack,
      currentTrackIndex,
      isPlaying,
      isEnabled,
      volume,
      isExpanded,
      autoplayBlocked,
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
    },
  ];
}
