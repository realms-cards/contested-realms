"use client";

import { useState, useEffect, useCallback } from "react";

export interface GraphicsSettings {
  /** Use 3D cards with thickness and lighting (true) or flat planes (false) */
  enhanced3DCards: boolean;
  /** Ambient light intensity multiplier (1.0 = default) */
  lightingIntensity: number;
}

const STORAGE_KEY = "sorcery-graphics-settings";

const DEFAULT_SETTINGS: GraphicsSettings = {
  enhanced3DCards: true,
  lightingIntensity: 1.0,
};

function loadSettings(): GraphicsSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: GraphicsSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for managing graphics settings with localStorage persistence
 */
export function useGraphicsSettings() {
  const [settings, setSettingsState] = useState<GraphicsSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    setSettingsState(loadSettings());
    setIsLoaded(true);
  }, []);

  const setSettings = useCallback((updates: Partial<GraphicsSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  const toggleEnhanced3DCards = useCallback(() => {
    setSettings({ enhanced3DCards: !settings.enhanced3DCards });
  }, [settings.enhanced3DCards, setSettings]);

  const setLightingIntensity = useCallback(
    (intensity: number) => {
      setSettings({ lightingIntensity: Math.max(0.5, Math.min(2.0, intensity)) });
    },
    [setSettings]
  );

  return {
    settings,
    isLoaded,
    setSettings,
    toggleEnhanced3DCards,
    setLightingIntensity,
  };
}

// Export a getter for non-React contexts (e.g., CardPlane which may need immediate value)
export function getGraphicsSettings(): GraphicsSettings {
  return loadSettings();
}
