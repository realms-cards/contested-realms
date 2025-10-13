# Music Player Implementation

## Overview
Minimalist collapsible music player for active gameplay (Board view). Plays medieval/fantasy-themed background music from `/public/music/` with persistent user controls.

## Features Implemented

### ✅ Core Functionality
- **Auto-play during Board view** - Music starts automatically when entering active gameplay (post-mulligan)
- **Persistent settings** - Volume, enabled state, and UI state saved to localStorage
- **Full playback controls** - Play/pause, volume slider, skip forward/backward, track list selector
- **Collapsible UI** - Semi-transparent note icon (50% opacity) expands to show full controls
- **6 music tracks** - All tracks from `/public/music/` directory supported

### ✅ UI/UX
- **Minimalist design** - Clean icon-based controls, no excess decoration
- **Strike-through icon** - Note icon shows strike-through when volume = 0%
- **Autoplay blocking** - Graceful handling with pulse animation and user prompt
- **Click outside to collapse** - Intuitive collapse behavior
- **Track list selector** - Dropdown showing all 6 tracks with current highlighted

### ✅ Technical Details
- **TypeScript strict mode** - No `any` types, full type safety
- **Error handling** - Auto-skip on audio loading failures
- **Browser compatibility** - Handles autoplay policies gracefully
- **Performance** - Minimal overhead, no impact on Board rendering

## Files Created

### 1. Configuration (`src/lib/music/music-config.ts`)
```typescript
export const MUSIC_TRACKS: MusicTrack[] = [/* 6 tracks */];
export const MUSIC_DEFAULTS = {
  volume: 0.7,
  enabled: true,
  expanded: false,
};
export const MUSIC_STORAGE_KEYS = {
  enabled: "music:enabled",
  volume: "music:volume",
  expanded: "music:expanded",
  currentTrackIndex: "music:currentTrackIndex",
};
```

**Functions:**
- `formatTrackTitle(filename)` - Convert filename to human-readable title
- `getTrackByIndex(index)` - Get track with wraparound
- `getNextTrackIndex(current)` - Next track with looping
- `getPreviousTrackIndex(current)` - Previous track with looping

### 2. Hook (`src/hooks/useMusicPlayer.ts`)
```typescript
const [state, controls] = useMusicPlayer();

// State
state.currentTrack          // MusicTrack
state.currentTrackIndex     // number
state.isPlaying             // boolean
state.isEnabled             // boolean
state.volume                // number (0-1)
state.isExpanded            // boolean
state.autoplayBlocked       // boolean

// Controls
controls.togglePlay()
controls.setVolume(volume)
controls.nextTrack()
controls.previousTrack()
controls.selectTrack(index)
controls.toggleEnabled()
controls.toggleExpanded()
controls.setExpanded(expanded)
```

**Features:**
- Audio element lifecycle management
- localStorage persistence for all settings
- Automatic track rotation on track end
- Error recovery with auto-skip
- Autoplay blocking detection

### 3. Component (`src/components/game/MusicPlayer.tsx`)
```typescript
<MusicPlayer />
```

**Collapsed State:**
- Semi-transparent note icon (50% opacity)
- Strike-through when volume = 0%
- Pulse animation when autoplay blocked
- Click to expand

**Expanded State:**
- Play/pause toggle
- Volume slider with real-time feedback
- Skip forward/backward buttons
- Current track name and position (e.g., "3 / 6")
- Track list selector dropdown
- Music enabled/disabled toggle
- Click outside or icon to collapse

### 4. Integration (`src/app/online/play/[id]/page.tsx`)
```typescript
import MusicPlayer from "@/components/game/MusicPlayer";

// Render only during active gameplay
{!setupOpen && !shouldShowDraft && <MusicPlayer />}
```

**Integration Logic:**
- Music player only visible when `!setupOpen && !shouldShowDraft`
- `setupOpen` = false means past deck selection, D20 rolling, and mulligan
- `shouldShowDraft` = false means not in draft phase
- Result: Music only plays during Board view (active gameplay)

## localStorage Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `music:enabled` | boolean | `true` | Whether music is enabled |
| `music:volume` | number | `0.7` | Volume level (0-1) |
| `music:expanded` | boolean | `false` | Whether UI is expanded |
| `music:currentTrackIndex` | number | `0` | Current track index |

## Music Tracks

All tracks located in `/public/music/`:

1. Along the Wayside - Medieval Folk Music
2. Boar Hunting - Disturbing Wild Dark Ancient
3. Fantasy Kingdom
4. Fantasy Medieval Mystery Ambient
5. Just Lute - Medieval Lute Music
6. The Ballad of My Sweet Fair Maiden

## User Experience

### First Time User
1. User enters Board view for first time
2. Music auto-plays at 70% volume (default)
3. Semi-transparent note icon visible in bottom-right
4. User can click icon to expand and adjust settings

### Returning User
1. All settings restored from localStorage
2. Music starts at previous volume level
3. Enabled/disabled state preserved
4. UI expanded/collapsed state preserved

### Browser Autoplay Blocked
1. Note icon pulses to indicate action needed
2. User clicks icon to expand player
3. Message shown: "Click play to start music"
4. User clicks play button
5. Music starts and setting saved for future sessions

## Testing Checklist

- [x] Music auto-plays when entering Board view (if enabled)
- [x] Music does NOT play during deck selection, mulligan, or draft
- [x] Volume persists across page reloads
- [x] Enabled/disabled state persists
- [x] Expanded/collapsed state persists
- [x] Track skipping forward and backward works
- [x] Playlist loops correctly (last → first, first → last)
- [x] Track selection from list works
- [x] Volume slider updates in real-time
- [x] Note icon shows strike-through at volume = 0%
- [x] Click outside collapses expanded player
- [x] All 6 tracks load and play correctly
- [x] Error handling skips to next track on load failure
- [x] Autoplay blocking handled with pulse animation
- [x] TypeScript strict mode compliance (no `any` types)
- [x] No visual overlap with game UI

## Future Enhancements (Optional)

- [ ] Fade-in/fade-out transitions between tracks
- [ ] Preload next track for seamless transitions
- [ ] Smooth expand/collapse animations
- [ ] Keyboard shortcuts (e.g., Space to play/pause)
- [ ] Remember last played track position
- [ ] Shuffle mode
- [ ] Repeat single track mode

## Notes

- Music player uses HTML5 Audio API (no external dependencies)
- All controls are icon-based from lucide-react (already in project)
- Component is fully self-contained and can be removed by commenting out single line
- No changes to game state or store - completely isolated feature
- Follows project's TypeScript strict mode conventions
- Uses project's existing styling patterns (Tailwind CSS)
