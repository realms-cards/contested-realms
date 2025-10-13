# Music Player Capability

## ADDED Requirements

### Requirement: Music Playback During Active Gameplay
The system SHALL provide background music playback only during active gameplay (Board view after mulligan phase) with user-controlled settings that persist across sessions.

#### Scenario: Music auto-plays when entering Board view
- **WHEN** a user completes mulligan phase and enters the Board view for active gameplay
- **AND** music is enabled in settings
- **THEN** background music SHALL automatically begin playing
- **AND** the music player icon SHALL become visible

#### Scenario: Music does not play during non-gameplay phases
- **WHEN** a user is in deck selection, draft, or mulligan phase
- **THEN** music SHALL NOT play
- **AND** the music player SHALL NOT be visible

#### Scenario: Music remains off if disabled
- **WHEN** a user has disabled music in their settings
- **AND** enters Board view for active gameplay
- **THEN** music SHALL NOT auto-play
- **AND** the music player icon SHALL indicate music is disabled

### Requirement: Collapsible Minimalist UI
The system SHALL display a semi-transparent note icon that expands to reveal full playback controls on click.

#### Scenario: Collapsed state shows note icon only
- **WHEN** the music player is rendered in its default collapsed state
- **THEN** only a note icon SHALL be visible
- **AND** the icon SHALL have 50% opacity
- **AND** the icon SHALL be positioned unobtrusively (e.g., bottom-right corner)

#### Scenario: Note icon shows strike-through when volume is zero
- **WHEN** the volume is set to 0%
- **THEN** the note icon SHALL display with strike-through styling
- **AND** the 50% opacity SHALL be maintained

#### Scenario: Clicking icon expands to show full controls
- **WHEN** a user clicks the note icon
- **THEN** the player SHALL expand to show full controls
- **AND** controls SHALL include: play/pause, volume slider, skip forward, skip backward, track list selector
- **AND** the expanded view SHALL have a semi-transparent background

#### Scenario: Clicking outside collapses player
- **WHEN** the player is expanded
- **AND** the user clicks outside the player area or clicks the icon again
- **THEN** the player SHALL collapse back to icon-only state
- **AND** current playback SHALL continue uninterrupted

### Requirement: Persistent Music Settings
The system SHALL store music preferences in localStorage and restore them across browser sessions.

#### Scenario: Volume setting persists across sessions
- **WHEN** a user adjusts the volume slider to 50%
- **AND** closes and reopens the browser
- **AND** enters Board view in a new match
- **THEN** the music SHALL play at 50% volume
- **AND** the volume slider SHALL show 50%

#### Scenario: Enabled/disabled state persists
- **WHEN** a user toggles music off
- **AND** closes the browser
- **AND** enters Board view in a new session
- **THEN** music SHALL remain disabled
- **AND** the toggle SHALL show "off" state

#### Scenario: Expanded/collapsed state persists
- **WHEN** a user expands the music player controls
- **AND** navigates away and returns to Board view
- **THEN** the player SHALL restore the previous expanded/collapsed state

#### Scenario: Settings default to enabled with moderate volume
- **WHEN** a user has no existing music settings in localStorage
- **AND** enters Board view for the first time
- **THEN** music SHALL be enabled by default
- **AND** volume SHALL default to 70%
- **AND** the player SHALL be in collapsed state (icon only)

### Requirement: Full Playback Controls
The system SHALL provide minimalist UI controls for play/pause, volume adjustment, track skipping (forward and backward), and track selection.

#### Scenario: User toggles music on/off
- **WHEN** a user clicks the play/pause toggle button in the expanded player
- **THEN** music playback SHALL immediately start or stop
- **AND** the setting SHALL be saved to localStorage
- **AND** the button icon SHALL update to reflect the new state

#### Scenario: User adjusts volume
- **WHEN** a user drags the volume slider in the expanded player
- **THEN** the music volume SHALL update in real-time as the slider moves
- **AND** the new volume level SHALL be saved to localStorage
- **AND** the volume SHALL remain at the new level for subsequent tracks
- **AND** if volume reaches 0%, the note icon SHALL show strike-through when collapsed

#### Scenario: User skips to next track
- **WHEN** a user clicks the "skip forward" button
- **THEN** the current track SHALL stop immediately
- **AND** the next track in the playlist SHALL begin playing
- **AND** if at the last track, playback SHALL restart from the first track

#### Scenario: User skips to previous track
- **WHEN** a user clicks the "skip backward" button
- **THEN** the current track SHALL stop immediately
- **AND** the previous track in the playlist SHALL begin playing
- **AND** if at the first track, playback SHALL jump to the last track

#### Scenario: User selects specific track from list
- **WHEN** a user opens the track list selector
- **AND** clicks a specific track
- **THEN** the currently playing track SHALL stop
- **AND** the selected track SHALL begin playing immediately
- **AND** the track list SHALL show the newly selected track as active

### Requirement: Track Rotation and Playlist Management
The system SHALL play tracks sequentially from the `/public/music/` directory and loop the playlist automatically.

#### Scenario: Playlist loops after last track
- **WHEN** the last track in the playlist finishes playing
- **THEN** the first track SHALL automatically begin playing
- **AND** playback SHALL continue seamlessly

#### Scenario: Track metadata displays correctly
- **WHEN** a track is playing
- **AND** the player is in expanded state
- **THEN** the music player UI SHALL display the current track name
- **AND** track names SHALL be derived from filenames with hyphens replaced by spaces

#### Scenario: Track list shows all available tracks
- **WHEN** a user opens the track list selector
- **THEN** all 6 tracks from `/public/music/` SHALL be listed
- **AND** the currently playing track SHALL be visually highlighted
- **AND** track names SHALL be formatted human-readable (hyphens → spaces)

### Requirement: Error Handling and Graceful Degradation
The system SHALL handle audio loading errors and browser limitations gracefully without crashing the match page.

#### Scenario: Audio file fails to load
- **WHEN** a music file fails to load due to network issues
- **THEN** the player SHALL skip to the next track automatically
- **AND** an error SHALL be logged to the console
- **AND** the match page SHALL remain functional
- **AND** the note icon SHALL remain visible

#### Scenario: Browser blocks autoplay
- **WHEN** the browser's autoplay policy blocks music from starting
- **AND** the user enters Board view for the first time
- **THEN** the note icon SHALL pulse or animate to indicate user action is needed
- **AND** clicking the icon SHALL expand the player with a "click play to start" message
- **AND** clicking play SHALL start music playback
- **AND** the setting SHALL be saved for future sessions
