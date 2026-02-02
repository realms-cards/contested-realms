"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type CameraMode = "orbit" | "topdown";

export interface GameViewSettings {
  cameraMode: CameraMode;
  showPlaymat: boolean;
  showGrid: boolean;
}

const STORAGE_KEY_CAMERA = "sorcery:cameraMode";
const STORAGE_KEY_PLAYMAT = "sorcery:showPlaymat";
const STORAGE_KEY_GRID = "sorcery:showGrid";

const DEFAULT_SETTINGS: GameViewSettings = {
  cameraMode: "topdown",
  showPlaymat: true,
  showGrid: false,
};

function loadFromLocalStorage(): GameViewSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const cameraMode = localStorage.getItem(STORAGE_KEY_CAMERA);
    const showPlaymat = localStorage.getItem(STORAGE_KEY_PLAYMAT);
    const showGrid = localStorage.getItem(STORAGE_KEY_GRID);
    return {
      cameraMode:
        cameraMode === "orbit" || cameraMode === "topdown"
          ? cameraMode
          : DEFAULT_SETTINGS.cameraMode,
      showPlaymat: showPlaymat !== null ? showPlaymat === "true" : DEFAULT_SETTINGS.showPlaymat,
      showGrid: showGrid !== null ? showGrid === "true" : DEFAULT_SETTINGS.showGrid,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveToLocalStorage(settings: Partial<GameViewSettings>): void {
  if (typeof window === "undefined") return;
  try {
    if (settings.cameraMode !== undefined) {
      localStorage.setItem(STORAGE_KEY_CAMERA, settings.cameraMode);
    }
    if (settings.showPlaymat !== undefined) {
      localStorage.setItem(STORAGE_KEY_PLAYMAT, String(settings.showPlaymat));
    }
    if (settings.showGrid !== undefined) {
      localStorage.setItem(STORAGE_KEY_GRID, String(settings.showGrid));
    }
  } catch {
    // Ignore storage errors
  }
}

async function loadFromApi(): Promise<GameViewSettings | null> {
  try {
    const res = await fetch("/api/users/me/playmats/preferences", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      cameraMode?: string;
      showPlaymat?: boolean;
      showGrid?: boolean;
    };
    return {
      cameraMode:
        data.cameraMode === "orbit" || data.cameraMode === "topdown"
          ? data.cameraMode
          : DEFAULT_SETTINGS.cameraMode,
      showPlaymat: typeof data.showPlaymat === "boolean" ? data.showPlaymat : DEFAULT_SETTINGS.showPlaymat,
      showGrid: typeof data.showGrid === "boolean" ? data.showGrid : DEFAULT_SETTINGS.showGrid,
    };
  } catch {
    return null;
  }
}

async function saveToApi(settings: Partial<GameViewSettings>): Promise<boolean> {
  try {
    const res = await fetch("/api/users/me/playmats/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Hook for managing game view settings (camera mode, playmat, grid).
 * Persists to API for authenticated users, falls back to localStorage.
 * Loads from API on mount if authenticated, else uses localStorage.
 */
export function useGameViewSettings() {
  const [settings, setSettingsState] = useState<GameViewSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const loadedRef = useRef(false);

  // Load settings on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const load = async () => {
      // First, load from localStorage for immediate display
      const localSettings = loadFromLocalStorage();
      setSettingsState(localSettings);

      // Then try to load from API (authenticated users)
      const apiSettings = await loadFromApi();
      if (apiSettings) {
        setIsAuthenticated(true);
        setSettingsState(apiSettings);
        // Sync API settings to localStorage for offline fallback
        saveToLocalStorage(apiSettings);
      }
      setIsLoaded(true);
    };

    void load();
  }, []);

  const updateSettings = useCallback(
    (updates: Partial<GameViewSettings>) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...updates };

        // Save to localStorage immediately
        saveToLocalStorage(updates);

        // Save to API in background (if authenticated)
        if (isAuthenticated) {
          void saveToApi(updates);
        }

        return next;
      });
    },
    [isAuthenticated],
  );

  const setCameraMode = useCallback(
    (mode: CameraMode) => {
      updateSettings({ cameraMode: mode });
    },
    [updateSettings],
  );

  const setShowPlaymat = useCallback(
    (show: boolean) => {
      updateSettings({ showPlaymat: show });
    },
    [updateSettings],
  );

  const setShowGrid = useCallback(
    (show: boolean) => {
      updateSettings({ showGrid: show });
    },
    [updateSettings],
  );

  const togglePlaymat = useCallback(() => {
    updateSettings({ showPlaymat: !settings.showPlaymat });
  }, [settings.showPlaymat, updateSettings]);

  const toggleGrid = useCallback(() => {
    updateSettings({ showGrid: !settings.showGrid });
  }, [settings.showGrid, updateSettings]);

  const toggleCameraMode = useCallback(() => {
    const newMode = settings.cameraMode === "orbit" ? "topdown" : "orbit";
    updateSettings({ cameraMode: newMode });
  }, [settings.cameraMode, updateSettings]);

  return {
    settings,
    isLoaded,
    isAuthenticated,
    updateSettings,
    setCameraMode,
    setShowPlaymat,
    setShowGrid,
    togglePlaymat,
    toggleGrid,
    toggleCameraMode,
  };
}

/**
 * Sync game store settings with user preferences.
 * Call this in game pages to apply loaded settings to the store.
 */
export function syncSettingsToStore(
  settings: GameViewSettings,
  store: {
    setCameraMode: (mode: CameraMode) => void;
    showPlaymat: boolean;
    showPlaymatOverlay: boolean;
    togglePlaymat?: () => void;
    togglePlaymatOverlay?: () => void;
  },
): void {
  store.setCameraMode(settings.cameraMode);

  // Sync playmat visibility
  if (store.showPlaymat !== settings.showPlaymat && store.togglePlaymat) {
    store.togglePlaymat();
  }

  // Sync grid visibility (showPlaymatOverlay = showGrid)
  if (store.showPlaymatOverlay !== settings.showGrid && store.togglePlaymatOverlay) {
    store.togglePlaymatOverlay();
  }
}
