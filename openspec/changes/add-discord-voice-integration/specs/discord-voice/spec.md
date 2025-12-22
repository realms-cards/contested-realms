# Discord Voice Integration — Spec

## ADDED Requirements

### Requirement: Discord Account Linking

Users MAY link their Discord account to their game account via OAuth2. The system SHALL store the user's Discord ID and cached display name.

#### Scenario: User links Discord account

- **GIVEN** a signed-in user without a linked Discord account
- **WHEN** the user initiates Discord linking from settings or voice prompt
- **THEN** they are redirected to Discord OAuth2 consent
- **AND** upon approval, their Discord ID is stored on their User record

#### Scenario: User with linked Discord

- **GIVEN** a user with a linked Discord account
- **WHEN** they view voice features
- **THEN** their Discord username is displayed
- **AND** they can create or join voice channels directly

---

### Requirement: Match Voice Channel Creation

The system SHALL create a temporary Discord voice channel when a match participant requests voice chat. The channel is created in a designated "Match Voice" category on the community Discord server.

#### Scenario: Player creates voice channel

- **GIVEN** a player in an active online match
- **AND** no voice channel exists for this match
- **WHEN** the player clicks "Start Voice"
- **THEN** a new voice channel is created named "Match-{shortId}"
- **AND** a spectate URL is posted as a pinned message in the channel
- **AND** an invite URL is returned to the client

#### Scenario: Voice channel already exists

- **GIVEN** a player in an active online match
- **AND** a voice channel already exists for this match
- **WHEN** the player clicks "Join Voice"
- **THEN** the existing channel's invite URL is returned

#### Scenario: Bot unavailable

- **GIVEN** the Discord bot is offline or unconfigured
- **WHEN** a player attempts to create a voice channel
- **THEN** an error message is shown: "Voice chat is temporarily unavailable"
- **AND** the game continues without voice integration

---

### Requirement: Voice Channel Invite

The system SHALL provide an invite URL that opens the Discord voice channel. The URL SHOULD attempt to open the Discord desktop app via protocol handler, with a fallback to web Discord.

#### Scenario: Discord app installed

- **GIVEN** a player with Discord desktop app installed
- **WHEN** they click the voice invite
- **THEN** the Discord app opens to the voice channel
- **AND** they are prompted to join voice

#### Scenario: Discord app not installed

- **GIVEN** a player without Discord desktop app
- **WHEN** they click the voice invite
- **THEN** the Discord web app opens in a new tab
- **AND** they can join voice via browser

---

### Requirement: Voice Presence Display

The system SHALL display which match participants are currently in the voice channel. Presence updates in near-real-time when members join or leave.

#### Scenario: Show voice members

- **GIVEN** a voice channel exists for the match
- **WHEN** players are in the voice channel
- **THEN** the UI shows their Discord avatars and/or a member count
- **AND** the display updates when members join/leave

#### Scenario: No voice channel

- **GIVEN** no voice channel exists for the match
- **WHEN** viewing the match UI
- **THEN** a "Start Voice" button is shown (if user has Discord linked)
- **OR** a "Link Discord" prompt is shown (if user has no Discord linked)

---

### Requirement: Spectate URL Sharing

When a voice channel is created, the system SHALL automatically post the match spectate URL as a message in the voice channel's text chat.

#### Scenario: Spectate URL posted

- **GIVEN** a voice channel is created for a match
- **WHEN** the channel creation completes
- **THEN** a message is posted: "Watch the match: {spectateUrl}"
- **AND** the message is pinned for visibility

#### Scenario: Spectators join via Discord

- **GIVEN** a Discord user sees the spectate URL in the voice channel
- **WHEN** they click the spectate link
- **THEN** they can watch the match in their browser
- **AND** they can listen to player commentary in Discord voice

---

### Requirement: Voice Channel Cleanup

The system SHALL automatically delete voice channels after the match ends, with a grace period for post-match discussion.

#### Scenario: Match ends normally

- **GIVEN** a match with an active voice channel
- **WHEN** the match ends (winner determined or concession)
- **THEN** a "Match ended" message is posted to the channel
- **AND** the channel is deleted after 5 minutes

#### Scenario: Match abandoned

- **GIVEN** a match where all players disconnect
- **WHEN** the match is marked as abandoned
- **THEN** the voice channel is deleted after 5 minutes

#### Scenario: Orphaned channel cleanup

- **GIVEN** a voice channel with no associated active match
- **AND** the channel is older than 1 hour
- **WHEN** the cleanup job runs
- **THEN** the channel is deleted
- **AND** a log entry is created for monitoring

---

### Requirement: Discord Linking Prompt

Users without a linked Discord account SHALL see a prompt to link when they attempt to use voice features.

#### Scenario: Unlinked user clicks voice

- **GIVEN** a player without a linked Discord account
- **WHEN** they click any voice-related button
- **THEN** a modal appears: "Link your Discord account to use voice chat"
- **AND** the modal has a "Link Discord" button that initiates OAuth2

#### Scenario: User dismisses prompt

- **GIVEN** a player sees the Discord linking prompt
- **WHEN** they dismiss it
- **THEN** the prompt closes
- **AND** they can still play the match normally without voice
