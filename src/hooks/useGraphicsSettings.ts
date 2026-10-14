"use client";

import { useState, useEffect, useCallback } from "react";

export type HandSortOrder = "sitesFirst" | "spellsFirst";

/**
 * Which board engine mode draws: the 3D table, the flat DOM board, or "auto", which picks
 * per device (see `resolveBoardView` in src/lib/engine-mode/boardView.ts).
 */
export type BoardViewPreference = "auto" | "3d" | "2d";

/** TILE_SIZE / CARD_LONG — the point where a site spans its tile edge to edge. */
export const SITE_SCALE_MAX = 1.82;

/**
 * What a site scales to when the player has expressed no preference.
 *
 * A mode sets this for as long as it is on screen — engine mode asks for 1.5, because its board
 * is read far more than it is dragged on. It is deliberately NOT written into the stored
 * settings: that would leak one mode's taste into every other mode and into the settings panel.
 * The moment the player moves the slider their number is stored, and `getSiteCardScale` stops
 * consulting this at all.
 */
let siteScaleFallback = 1;

export function setSiteCardScaleFallback(scale: number): void {
  siteScaleFallback = scale;
}

/** The scale a site should actually be drawn at: the player's choice, else the mode's. */
export function getSiteCardScale(): number {
  return loadSettings().siteCardScale ?? siteScaleFallback;
}

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
  /**
   * How much larger a SITE is drawn on the board, 1 = as printed.
   *
   * A site's own footprint is only 55% of its tile across and 39% deep — about a fifth of the
   * tile — so a couple of units standing on it hide it completely. 1.82 is the point where it
   * fills the tile horizontally, and also very nearly the largest an untapped site can be and
   * still fit (the limit is 1.83), so that is the ceiling.
   *
   * `null` means the player has never chosen, and whichever mode is on screen picks for them
   * (see `setSiteCardScaleFallback`). Storing a number here is what makes it THEIR choice, so
   * it then outranks the mode in every mode, forever.
   */
  siteCardScale: number | null;
  /**
   * How much colour a SITE keeps on the board: 1 as printed, 0.5 half drained, 0 grey.
   *
   * Sites are backdrops — the units standing on them are what you act on — so draining them is
   * a way to push them back without making them smaller or dimmer. It applies to sites only,
   * unlike the account-wide monochrome aid which takes the whole page.
   */
  siteSaturation: number;
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
  monochromeMode: boolean;
  /** Engine-mode board: 3D table, flat 2D board, or "auto" (2D on phones) */
  boardView: BoardViewPreference;
}

const STORAGE_KEY = "sorcery-graphics-settings";

const DEFAULT_SETTINGS: GraphicsSettings = {
  enhanced3DCards: true,
  lightingIntensity: 1.0,
  showTable: true,
  cardPreviewScale: 1.0,
  handCardScale: 1.0,
  siteCardScale: null,
  siteSaturation: 1,
  uiTextScale: 1.0,
  handSortOrder: "sitesFirst",
  gamepadLifeControls: false,
  preferRaster: false,
  showResolverGlow: true,
  monochromeMode: false,
  boardView: "auto",
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

  /** 1.82 fills the tile horizontally and is as large as an untapped site can be and still fit. */
  const setSiteCardScale = useCallback(
    (scale: number) => {
      setSettings({
        siteCardScale: Math.max(1, Math.min(SITE_SCALE_MAX, scale)),
      });
    },
    [setSettings],
  );

  const setSiteSaturation = useCallback(
    (value: number) => {
      setSettings({ siteSaturation: Math.max(0, Math.min(1, value)) });
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

  const toggleMonochromeMode = useCallback(() => {
    setSettings({ monochromeMode: !settings.monochromeMode });
  }, [settings.monochromeMode, setSettings]);

  const setBoardView = useCallback(
    (boardView: BoardViewPreference) => {
      setSettings({ boardView });
    },
    [setSettings],
  );

  return {
    settings,
    isLoaded,
    setSettings,
    toggleEnhanced3DCards,
    setLightingIntensity,
    toggleShowTable,
    setCardPreviewScale,
    setHandCardScale,
    setSiteCardScale,
    setSiteSaturation,
    setUiTextScale,
    toggleHandSortOrder,
    toggleGamepadLifeControls,
    togglePreferRaster,
    toggleShowResolverGlow,
    toggleMonochromeMode,
    setBoardView,
  };
}

// Export a getter for non-React contexts (e.g., CardPlane which may need immediate value)
export function getGraphicsSettings(): GraphicsSettings {
  return loadSettings();
}

/**
 * Which visual aid is in force, for anything that encodes meaning in COLOUR.
 *
 * Both aids are already written to <body> — `data-colorblind` by ColorBlindContext and
 * `data-monochrome-mode` by GraphicsSettingsScope — and the CSS that follows from them restyles
 * the DOM. None of that reaches WebGL: a canvas takes the grayscale filter as one flat image, so
 * the board's own colour language (which tile is clickable, whose unit is whose) has to pick its
 * palette itself.
 *
 * The body attributes are the single source of truth rather than the React context, because
 * React context does NOT cross into the react-three-fiber tree — the board renders under its own
 * reconciler. Reading the DOM works identically on both sides of that boundary, the same reason
 * `getGraphicsSettings` exists.
 *
 * Monochrome wins when both are on: once hue is gone, a hue-based palette has nothing to say.
 */
export type VisualAid = "none" | "colorblind" | "monochrome";

export function getVisualAid(): VisualAid {
  if (typeof document === "undefined") return "none";
  // monochrome lives on <html> (its filter must not become a containing block — see globals.css),
  // colour blindness on <body> alongside the CSS that keys off it
  if (document.documentElement.dataset.monochromeMode === "true") return "monochrome";
  if (document.body.dataset.colorblind === "true") return "colorblind";
  return "none";
}

/** `getVisualAid`, re-read whenever either body attribute changes. */
export function useVisualAid(): VisualAid {
  // start at "none" so the server render and the first client render agree
  const [aid, setAid] = useState<VisualAid>("none");
  useEffect(() => {
    const sync = () => setAid((current) => {
      const next = getVisualAid();
      return next === current ? current : next;
    });
    sync();
    const observer = new MutationObserver(sync);
    const watch = { attributes: true, attributeFilter: ["data-colorblind", "data-monochrome-mode"] };
    observer.observe(document.documentElement, watch);
    observer.observe(document.body, watch);
    return () => observer.disconnect();
  }, []);
  return aid;
}
