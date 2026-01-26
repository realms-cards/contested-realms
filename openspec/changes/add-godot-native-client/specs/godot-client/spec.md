# Godot Native Client Specification

## ADDED Requirements

### Requirement: Godot Client Server Connectivity

The Godot client SHALL connect to the existing Socket.IO server using the same protocol as the web client, enabling cross-play between platforms.

#### Scenario: Successful connection to server

- **GIVEN** a Godot client with valid configuration
- **WHEN** the client initiates connection with display name and optional Steam ID
- **THEN** the server responds with a welcome payload containing player info and protocol version
- **AND** the client is registered in the player list

#### Scenario: Connection with protocol version mismatch

- **GIVEN** a Godot client running an outdated protocol version
- **WHEN** the client connects to the server
- **THEN** the server responds with the minimum required client version
- **AND** the client displays an update prompt to the user

#### Scenario: Reconnection after disconnect

- **GIVEN** a Godot client that was previously connected
- **WHEN** the connection is lost unexpectedly
- **THEN** the client attempts reconnection with exponential backoff
- **AND** upon successful reconnection, the client requests a state resync

---

### Requirement: Cross-Platform Match Play

The Godot client SHALL support playing matches against web client users with full state synchronization.

#### Scenario: Godot vs Web match

- **GIVEN** a Godot client user and a web client user in the same lobby
- **WHEN** the host starts a constructed match
- **THEN** both clients receive the matchStarted event
- **AND** game state patches are synchronized to both clients identically
- **AND** actions from either client are processed by the server and broadcast to both

#### Scenario: State synchronization during gameplay

- **GIVEN** an active match between Godot and web clients
- **WHEN** a player performs an action (play card, attack, etc.)
- **THEN** both clients receive the resulting state patch
- **AND** both clients render the updated game state correctly

---

### Requirement: Steam Platform Integration

The Godot client SHALL integrate with Steamworks SDK for authentication, achievements, and social features.

#### Scenario: Steam authentication on launch

- **GIVEN** the Godot client is launched via Steam
- **WHEN** the client initializes
- **THEN** the Steam overlay is available
- **AND** the user's Steam persona name is used as display name
- **AND** the Steam ID is passed to the server for identification

#### Scenario: Achievement unlock

- **GIVEN** a user playing on the Godot Steam client
- **WHEN** the user completes an achievement condition (e.g., wins 10 matches)
- **THEN** the achievement is unlocked via Steamworks API
- **AND** the Steam notification overlay displays the achievement

#### Scenario: Cloud save synchronization

- **GIVEN** a user with preferences saved on one machine
- **WHEN** the user launches the Godot client on a different machine
- **THEN** preferences are loaded from Steam Cloud
- **AND** changes are synchronized back to Steam Cloud on save

---

### Requirement: Core Gameplay Rendering

The Godot client SHALL render the game board, cards, and UI with visual fidelity comparable to the web client.

#### Scenario: Board rendering

- **GIVEN** an active match with sites and permanents on the board
- **WHEN** the Godot client renders the game scene
- **THEN** the 4x5 tile grid is displayed with correct dimensions
- **AND** sites are rendered on their respective tiles with owner coloring
- **AND** permanents are stacked on tiles with appropriate z-offsets

#### Scenario: Card texture loading

- **GIVEN** a card needs to be displayed
- **WHEN** the Godot client requests the card texture
- **THEN** the texture is loaded from the CDN asynchronously
- **AND** a placeholder texture is shown during loading
- **AND** the final texture is cached for future use

#### Scenario: Hand rendering

- **GIVEN** a player has cards in their hand
- **WHEN** the hand is rendered
- **THEN** cards are displayed in an arc layout at the bottom of the screen
- **AND** hovering over a card expands it for preview
- **AND** cards can be dragged from hand to the board

---

### Requirement: Deck Builder

The Godot client SHALL provide a deck builder interface for creating and editing decks.

#### Scenario: Create new deck

- **GIVEN** a user on the deck builder screen
- **WHEN** the user searches for cards and drags them to the deck
- **THEN** cards are added to the deck list
- **AND** deck validation rules are enforced (40 cards, 1 avatar, etc.)
- **AND** the deck can be saved to the server

#### Scenario: Load existing deck

- **GIVEN** a user with saved decks on the server
- **WHEN** the user opens the deck selector
- **THEN** the user's decks are fetched and displayed
- **AND** selecting a deck loads it into the deck builder

---

### Requirement: Limited Format Support

The Godot client SHALL support sealed and draft game modes with the same functionality as the web client.

#### Scenario: Sealed deck construction

- **GIVEN** a sealed match has started
- **WHEN** the Godot client receives sealed packs from the server
- **THEN** packs are displayed for opening
- **AND** the user can build a deck from the opened card pool
- **AND** a construction timer is displayed
- **AND** the completed deck can be submitted before time expires

#### Scenario: Draft pick selection

- **GIVEN** a draft is in the picking phase
- **WHEN** the Godot client receives a pack of cards
- **THEN** the pack is displayed for selection
- **AND** the user can select one card to pick
- **AND** the pick is sent to the server
- **AND** the remaining pack is passed according to pack direction

---

### Requirement: Lobby and Matchmaking

The Godot client SHALL provide lobby browsing, creation, and matchmaking functionality.

#### Scenario: Browse open lobbies

- **GIVEN** the user is on the lobby screen
- **WHEN** lobbies are requested from the server
- **THEN** open lobbies are displayed in a list
- **AND** each lobby shows host name, player count, and match type

#### Scenario: Create and configure lobby

- **GIVEN** a user wants to host a match
- **WHEN** the user creates a new lobby
- **THEN** the lobby is created on the server
- **AND** the user can set visibility (open/private)
- **AND** the user can select match type and configuration

#### Scenario: Ready and start match

- **GIVEN** two players are in a lobby
- **WHEN** both players set their ready state
- **THEN** the host can start the match
- **AND** both clients receive the matchStarted event

---

### Requirement: Audio System

The Godot client SHALL provide sound effects and audio feedback for game actions.

#### Scenario: Game action sounds

- **GIVEN** the audio system is enabled
- **WHEN** a game action occurs (card play, draw, attack, etc.)
- **THEN** the appropriate sound effect is played
- **AND** volume is controlled by user settings

#### Scenario: Audio settings

- **GIVEN** the user opens settings
- **WHEN** the user adjusts audio volume sliders
- **THEN** master, music, and SFX volumes are updated
- **AND** settings are persisted to local storage or Steam Cloud

---

### Requirement: Offline Graceful Degradation

The Godot client SHALL handle server unavailability gracefully.

#### Scenario: Server unreachable on launch

- **GIVEN** the server is not reachable
- **WHEN** the Godot client attempts to connect
- **THEN** an error message is displayed to the user
- **AND** the client offers retry or offline mode (if implemented)

#### Scenario: Disconnect during match

- **GIVEN** an active match is in progress
- **WHEN** the connection to the server is lost
- **THEN** the client displays a reconnecting indicator
- **AND** the client attempts automatic reconnection
- **AND** upon reconnection, the client requests state resync
