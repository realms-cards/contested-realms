/**
 * Music Player Configuration
 *
 * Manages the playlist of background music tracks for gameplay.
 * Tracks are stored in /public/music/ directory.
 *
 * All music by Knight of Cups: https://knightofcups.bandcamp.com/
 */

/**
 * Track mood categories for dynamic music selection based on game state
 * - calm: For stable gameplay with little health change
 * - intense: For dramatic moments with significant health swings
 * - critical: For low health situations (< 5 life or death's door)
 * - neutral: Can play at any point in the game
 */
export type MusicMood = "calm" | "intense" | "critical" | "neutral";

export interface MusicTrack {
  /** Filename of the track */
  filename: string;
  /** Human-readable title (derived from filename) */
  title: string;
  /** Full path to the audio file */
  path: string;
  /** Mood category for dynamic track selection */
  mood: MusicMood;
}

/**
 * List of all available music tracks from /public/music/
 * First track (The Autumn Equinox) is always the starting track for matches.
 * Tracks are categorized by mood for dynamic selection based on game state.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  // Starting track - always plays first
  {
    filename: "knight-of-cups-the-autumn-equinox.mp3",
    title: "The Autumn Equinox",
    path: "/music/knight-of-cups-the-autumn-equinox.mp3",
    mood: "neutral",
  },
  // Calm tracks - for stable gameplay
  {
    filename: "knight-of-cups-reflective-quest.mp3",
    title: "Reflective Quest",
    path: "/music/knight-of-cups-reflective-quest.mp3",
    mood: "calm",
  },
  {
    filename: "knight-of-cups-page-of-pentacles.mp3",
    title: "Page of Pentacles",
    path: "/music/knight-of-cups-page-of-pentacles.mp3",
    mood: "calm",
  },
  // Intense tracks - for dramatic health swings
  {
    filename: "knight-of-cups-checkmate.mp3",
    title: "Checkmate",
    path: "/music/knight-of-cups-checkmate.mp3",
    mood: "intense",
  },
  {
    filename: "knight-of-cups-the-knight.mp3",
    title: "The Knight",
    path: "/music/knight-of-cups-the-knight.mp3",
    mood: "intense",
  },
  // Critical tracks - for low health / death's door
  {
    filename: "knight-of-cups-witchs-hunt.mp3",
    title: "Witch's Hunt",
    path: "/music/knight-of-cups-witchs-hunt.mp3",
    mood: "critical",
  },
  {
    filename: "knight-of-cups-stonewall-attack.mp3",
    title: "Stonewall Attack",
    path: "/music/knight-of-cups-stonewall-attack.mp3",
    mood: "critical",
  },
  // Neutral tracks - can play anytime
  {
    filename: "knight-of-cups-amber-morn.mp3",
    title: "Amber Morn",
    path: "/music/knight-of-cups-amber-morn.mp3",
    mood: "neutral",
  },
  {
    filename: "knight-of-cups-the-empress.mp3",
    title: "The Empress",
    path: "/music/knight-of-cups-the-empress.mp3",
    mood: "neutral",
  },
  {
    filename: "knight-of-cups-the-nine-of-swords.mp3",
    title: "The Nine of Swords",
    path: "/music/knight-of-cups-the-nine-of-swords.mp3",
    mood: "neutral",
  },
  {
    filename: "knight-of-cups-the-tower.mp3",
    title: "The Tower",
    path: "/music/knight-of-cups-the-tower.mp3",
    mood: "neutral",
  },
];

/**
 * Default settings for music player
 */
export const MUSIC_DEFAULTS = {
  /** Default volume level (0-1 range) */
  volume: 0.1,
  /** Default enabled state */
  enabled: false,
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

/**
 * Get starting track index (The Autumn Equinox - always first)
 */
export function getStartingTrackIndex(): number {
  return 0;
}

/**
 * Get all tracks matching a specific mood
 */
export function getTracksByMood(mood: MusicMood): MusicTrack[] {
  return MUSIC_TRACKS.filter((track) => track.mood === mood);
}

/**
 * Get tracks suitable for the current game state
 * - critical: health < 5 or death's door
 * - intense: significant health change (>= 5 damage in recent turns)
 * - calm: stable health (little change)
 * - neutral tracks can always be included
 */
export function getTracksForGameState(
  currentHealth: number,
  isDeathsDoor: boolean,
  recentHealthChange: number
): MusicTrack[] {
  // Critical situation: low health or death's door
  if (currentHealth < 5 || isDeathsDoor) {
    return [
      ...getTracksByMood("critical"),
      ...getTracksByMood("neutral"),
    ];
  }

  // Intense situation: dramatic health swings
  if (Math.abs(recentHealthChange) >= 5) {
    return [
      ...getTracksByMood("intense"),
      ...getTracksByMood("neutral"),
    ];
  }

  // Calm situation: stable gameplay
  return [
    ...getTracksByMood("calm"),
    ...getTracksByMood("neutral"),
  ];
}

/**
 * Select a random track from tracks suitable for the game state
 * Excludes the current track to avoid repeats
 */
export function selectTrackForGameState(
  currentHealth: number,
  isDeathsDoor: boolean,
  recentHealthChange: number,
  currentTrackIndex: number
): number {
  const suitableTracks = getTracksForGameState(
    currentHealth,
    isDeathsDoor,
    recentHealthChange
  );

  // Get indices of suitable tracks, excluding current track
  const suitableIndices = suitableTracks
    .map((track) => MUSIC_TRACKS.indexOf(track))
    .filter((index) => index !== currentTrackIndex);

  // If no suitable tracks (shouldn't happen), fall back to next track
  if (suitableIndices.length === 0) {
    return getNextTrackIndex(currentTrackIndex);
  }

  // Select random track from suitable options
  const randomIndex = Math.floor(Math.random() * suitableIndices.length);
  return suitableIndices[randomIndex];
}
