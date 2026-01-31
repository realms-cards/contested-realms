/**
 * Feature Flags Configuration
 * Centralized feature flag management for the application
 */

export interface FeatureFlags {
  tournaments: {
    enabled: boolean;
    maxConcurrentTournaments: number;
    supportedFormats: readonly ["sealed", "draft", "constructed"];
  };
  seatVideo: {
    enabled: boolean;
  };
  /**
   * Global audio-only mode for RTC
   * When enabled, the app establishes audio chat without requesting/using camera video.
   * Intended as a fallback when video transports are unreliable.
   */
  audioOnlyRtc: {
    enabled: boolean;
  };
  undo: {
    enabled: boolean;
  };
  cardSleeves: {
    enabled: boolean;
  };
  cpuBots: {
    enabled: boolean;
  };
}

/**
 * Parse boolean from environment variable
 */
function parseBooleanFlag(
  envVar: string | undefined,
  defaultValue: boolean = false
): boolean {
  if (!envVar) return defaultValue;
  return envVar.toLowerCase() === "true";
}

/**
 * Parse number from environment variable
 */
function parseNumberFlag(
  envVar: string | undefined,
  defaultValue: number
): number {
  if (!envVar) return defaultValue;
  const parsed = parseInt(envVar, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Global feature flags configuration
 */
export const FEATURE_FLAGS: FeatureFlags = {
  tournaments: {
    enabled: parseBooleanFlag(
      process.env.NEXT_PUBLIC_FEATURE_TOURNAMENTS,
      false
    ),
    maxConcurrentTournaments: parseNumberFlag(
      process.env.NEXT_PUBLIC_MAX_CONCURRENT_TOURNAMENTS,
      10
    ),
    supportedFormats: ["sealed", "draft", "constructed"] as const,
  },
  seatVideo: {
    enabled: parseBooleanFlag(
      process.env.NEXT_PUBLIC_FEATURE_SEAT_VIDEO,
      false
    ),
  },
  audioOnlyRtc: {
    enabled: parseBooleanFlag(
      process.env.NEXT_PUBLIC_FEATURE_AUDIO_ONLY,
      false
    ),
  },
  undo: {
    enabled: parseBooleanFlag(process.env.NEXT_PUBLIC_FEATURE_UNDO, true),
  },
  cardSleeves: {
    enabled: parseBooleanFlag(
      process.env.NEXT_PUBLIC_FEATURE_CARD_SLEEVES,
      true
    ),
  },
  cpuBots: {
    enabled:
      process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED === "1" ||
      parseBooleanFlag(process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED, false),
  },
};

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return FEATURE_FLAGS[feature].enabled;
}

/**
 * Get feature configuration
 */
export function getFeatureConfig<T extends keyof FeatureFlags>(
  feature: T
): FeatureFlags[T] {
  return FEATURE_FLAGS[feature];
}

/**
 * Tournament-specific feature checks
 */
export const tournamentFeatures = {
  isEnabled: () => FEATURE_FLAGS.tournaments.enabled,
  getMaxConcurrentTournaments: () =>
    FEATURE_FLAGS.tournaments.maxConcurrentTournaments,
  getSupportedFormats: () => FEATURE_FLAGS.tournaments.supportedFormats,
  isFormatSupported: (format: string) =>
    FEATURE_FLAGS.tournaments.supportedFormats.includes(
      format as "sealed" | "draft" | "constructed"
    ),
} as const;

/**
 * Legacy compatibility - maintain existing API
 */
export const FEATURE_SEAT_VIDEO: boolean = FEATURE_FLAGS.seatVideo.enabled;
export const FEATURE_AUDIO_ONLY: boolean = FEATURE_FLAGS.audioOnlyRtc.enabled;
export const FEATURE_UNDO: boolean = FEATURE_FLAGS.undo.enabled;
export const FEATURE_CARD_SLEEVES: boolean = FEATURE_FLAGS.cardSleeves.enabled;
export const FEATURE_CPU_BOTS: boolean = FEATURE_FLAGS.cpuBots.enabled;
