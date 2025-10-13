# Add Match Music Player

## Why
Users have requested background music during matches to enhance the gaming atmosphere. Six medieval/fantasy-themed MP3 tracks have been added to `/public/music/` and need to be integrated with persistent user preferences for volume and playback control.

## What Changes
- Add a minimalist collapsible music player component for active gameplay (Board view only)
- Implement localStorage-based settings for music on/off state and volume level
- Provide full playback controls: play/pause toggle, volume slider, skip forward/backward, and track list selection
- Display semi-transparent note icon (50% opacity) that expands to show full controls on click
- Strike-through note icon when volume is at 0%
- Auto-play music only during active gameplay (after mulligan phase) with settings persisted across sessions
- Integrate with existing game UI without disrupting match flow

## Impact
- **Affected specs**: `music-player` (new capability)
- **Affected code**:
  - New component: `src/components/game/MusicPlayer.tsx` (collapsible minimalist UI with note icon)
  - Updated: `src/lib/game/Board.tsx` (conditionally render music player during active gameplay only)
  - New hook: `src/hooks/useMusicPlayer.ts` (manage playback state and settings)
  - New utilities: `src/lib/music/music-config.ts` (track list and metadata)
- **Design decisions**:
  - Music activates only during Board view (after mulligan phase completes)
  - Minimalist controls with collapsible UI (collapsed = note icon only at 50% opacity)
  - Full controls: play/pause, volume slider, skip forward, skip backward, track list selector
  - Note icon gets strike-through styling when volume = 0%
