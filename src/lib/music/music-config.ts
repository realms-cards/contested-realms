/**
 * Music Player Configuration
 *
 * Manages the playlist of background music tracks for gameplay.
 * Tracks are stored in /public/music/ directory.
 */

export interface MusicTrack {
  /** Filename of the track */
  filename: string;
  /** Human-readable title (derived from filename) */
  title: string;
  /** Full path to the audio file */
  path: string;
}

/**
 * List of all available music tracks from /public/music/
 * Order defines the default playlist sequence.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  {
    filename: "along-the-wayside-medieval-folk-music-128697.mp3",
    title: "Along the Wayside",
    path: "/music/along-the-wayside-medieval-folk-music-128697.mp3",
  },
  {
    filename: "boar-hunting-disturbing-wild-dark-ancient-344752.mp3",
    title: "Boar Hunting",
    path: "/music/boar-hunting-disturbing-wild-dark-ancient-344752.mp3",
  },
  {
    filename: "fantasy-kingdom-261257.mp3",
    title: "Kingdom",
    path: "/music/fantasy-kingdom-261257.mp3",
  },
  {
    filename: "fantasy-medieval-mystery-ambient-292418.mp3",
    title: "Deus",
    path: "/music/fantasy-medieval-mystery-ambient-292418.mp3",
  },
  {
    filename: "just-lute-medieval-lute-music-363314.mp3",
    title: "My Lute",
    path: "/music/just-lute-medieval-lute-music-363314.mp3",
  },
  {
    filename:
      "the-ballad-of-my-sweet-fair-maiden-medieval-style-music-358306.mp3",
    title: "The Ballad of My Sweet Fair Maiden",
    path: "/music/the-ballad-of-my-sweet-fair-maiden-medieval-style-music-358306.mp3",
  },
];

/**
 * Default settings for music player
 */
export const MUSIC_DEFAULTS = {
  /** Default volume level (0-1 range) */
  volume: 0.3,
  /** Default enabled state */
  enabled: true,
  /** Default expanded state (collapsed = icon only) */
  expanded: false,
} as const;

/**
 * localStorage keys for persisting music settings
 */
export const MUSIC_STORAGE_KEYS = {
  enabled: "music:enabled",
  volume: "music:volume",
  expanded: "music:expanded",
  currentTrackIndex: "music:currentTrackIndex",
} as const;

/**
 * Format a track filename into a human-readable title
 * Replaces hyphens with spaces and capitalizes words
 */
export function formatTrackTitle(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.mp3$/i, "");

  // Replace hyphens with spaces and capitalize first letter of each word
  return nameWithoutExt
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get track by index, wrapping around if out of bounds
 */
export function getTrackByIndex(index: number): MusicTrack {
  const wrappedIndex =
    ((index % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
  return MUSIC_TRACKS[wrappedIndex];
}

/**
 * Get next track index (wraps to 0 after last track)
 */
export function getNextTrackIndex(currentIndex: number): number {
  return (currentIndex + 1) % MUSIC_TRACKS.length;
}

/**
 * Get previous track index (wraps to last track before first)
 */
export function getPreviousTrackIndex(currentIndex: number): number {
  return (currentIndex - 1 + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
}
