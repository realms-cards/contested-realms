"use client";

import { useState, useEffect, useCallback } from "react";

export type HandSortOrder = "sitesFirst" | "spellsFirst";

export interface GraphicsSettings {
  /** Use 3D cards with thickness and lighting (true) or flat planes (false) */
  enhanced3DCards: boolean;
  /** Ambient light intensity multiplier (1.0 = default) */
  lightingIntensity: number;
  /** Show the 3D table model underneath the playmat */
  showTable: boolean;
  /** Scale multiplier for card preview size (0.5 - 2.5, default 1.0, mobile default 2.5) */
  cardPreviewScale: number;
  /** Scale multiplier for hand card size (0.5 - 2.0, default 1.0) */
  handCardScale: number;
  /** Scale multiplier for console/toolbox text size (0.5 - 1.5, default 1.0) */
  uiTextScale: number;
  /** Hand card sort order: sites first (default) or spells first */
  handSortOrder: HandSortOrder;
  /** Enable gamepad shoulder buttons (LB/RB) for life adjustment */
  gamepadLifeControls: boolean;
  /** Use raster textures (WebP/PNG) instead of KTX2 - reduces CPU load on older devices */
  preferRaster: boolean;
  /** Show a subtle purple glow on cards that have a custom resolver (automated behavior) */
  showResolverGlow: boolean;
}

const STORAGE_KEY = "sorcery-graphics-settings";

const DEFAULT_SETTINGS: GraphicsSettings = {
  enhanced3DCards: true,
  lightingIntensity: 1.0,
  showTable: true,
  cardPreviewScale: 1.0,
  handCardScale: 1.0,
  uiTextScale: 1.0,
  handSortOrder: "sitesFirst",
  gamepadLifeControls: false,
  preferRaster: false,
  showResolverGlow: true,
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
 * Hook for managing graphics settings with localStorage persistence.
 * Syncs across components via storage events.
 */
export function useGraphicsSettings() {
  const [settings, setSettingsState] =
    useState<GraphicsSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    setSettingsState(loadSettings());
    setIsLoaded(true);
  }, []);

  // Sync across tabs/components when localStorage changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(e.newValue) });
        } catch {
          // Ignore parse errors
        }
      }
    };

    // Also listen for custom event for same-tab sync
    const handleCustomSync = () => {
      setSettingsState(loadSettings());
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("graphics-settings-changed", handleCustomSync);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("graphics-settings-changed", handleCustomSync);
    };
  }, []);

  const setSettings = useCallback((updates: Partial<GraphicsSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      // Dispatch custom event to sync other hook instances in the same tab
      // Use queueMicrotask to avoid setState during render of other components
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent("graphics-settings-changed"));
      });
      return next;
    });
  }, []);

  const toggleEnhanced3DCards = useCallback(() => {
    setSettings({ enhanced3DCards: !settings.enhanced3DCards });
  }, [settings.enhanced3DCards, setSettings]);

  const setLightingIntensity = useCallback(
    (intensity: number) => {
      setSettings({
        lightingIntensity: Math.max(0.5, Math.min(2.0, intensity)),
      });
    },
    [setSettings],
  );

  const toggleShowTable = useCallback(() => {
    setSettings({ showTable: !settings.showTable });
  }, [settings.showTable, setSettings]);

  const setCardPreviewScale = useCallback(
    (scale: number) => {
      setSettings({
        cardPreviewScale: Math.max(0.5, Math.min(2.5, scale)),
      });
    },
    [setSettings],
  );

  const setHandCardScale = useCallback(
    (scale: number) => {
      setSettings({
        handCardScale: Math.max(0.5, Math.min(2.0, scale)),
      });
    },
    [setSettings],
  );

  const setUiTextScale = useCallback(
    (scale: number) => {
      setSettings({
        uiTextScale: Math.max(0.5, Math.min(1.5, scale)),
      });
    },
    [setSettings],
  );

  const toggleHandSortOrder = useCallback(() => {
    setSettings({
      handSortOrder:
        settings.handSortOrder === "sitesFirst" ? "spellsFirst" : "sitesFirst",
    });
  }, [settings.handSortOrder, setSettings]);

  const toggleGamepadLifeControls = useCallback(() => {
    setSettings({ gamepadLifeControls: !settings.gamepadLifeControls });
  }, [settings.gamepadLifeControls, setSettings]);

  const togglePreferRaster = useCallback(() => {
    setSettings({ preferRaster: !settings.preferRaster });
  }, [settings.preferRaster, setSettings]);

  const toggleShowResolverGlow = useCallback(() => {
    setSettings({ showResolverGlow: !settings.showResolverGlow });
  }, [settings.showResolverGlow, setSettings]);

  return {
    settings,
    isLoaded,
    setSettings,
    toggleEnhanced3DCards,
    setLightingIntensity,
    toggleShowTable,
    setCardPreviewScale,
    setHandCardScale,
    setUiTextScale,
    toggleHandSortOrder,
    toggleGamepadLifeControls,
    togglePreferRaster,
    toggleShowResolverGlow,
  };
}

// Export a getter for non-React contexts (e.g., CardPlane which may need immediate value)
export function getGraphicsSettings(): GraphicsSettings {
  return loadSettings();
}
