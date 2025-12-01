## ADDED Requirements

### Requirement: Avatar Ability Detection

The system SHALL detect avatar-specific abilities by matching the avatar card name, enabling ability-specific game mechanics before cards exist in the database.

#### Scenario: Harbinger avatar detected

- **WHEN** a player's avatar card name contains "Harbinger" (case-insensitive)
- **THEN** the system identifies that player as having the Harbinger ability

#### Scenario: Non-Harbinger avatar

- **WHEN** a player's avatar card name does not contain "Harbinger"
- **THEN** the system does not trigger Harbinger-specific mechanics for that player

#### Scenario: Database-independent detection

- **WHEN** the avatar card does not exist in the database
- **THEN** the system still detects the ability based on the card name provided by the deck

---

### Requirement: Harbinger Portal Roll Phase

The system SHALL provide a portal roll phase after main setup when a Harbinger avatar is present, allowing the Harbinger player to roll 3 D20 to determine portal tile locations.

#### Scenario: Portal roll phase triggers

- **WHEN** either player's avatar is detected as Harbinger
- **AND** the D20 setup roll phase completes
- **THEN** the system displays the Harbinger Portal Roll screen before mulligan phase

#### Scenario: Harbinger player can roll

- **WHEN** the portal roll screen is displayed
- **AND** the current user is the Harbinger player
- **THEN** the user can click each of 3 green D20 dice to roll them

#### Scenario: Opponent watches portal roll

- **WHEN** the portal roll screen is displayed
- **AND** the current user is NOT the Harbinger player
- **THEN** the user sees the dice and results but cannot interact with them

#### Scenario: No Harbinger present

- **WHEN** neither player's avatar is detected as Harbinger
- **THEN** the portal roll phase is skipped entirely

---

### Requirement: Duplicate Roll Handling

The system SHALL detect duplicate D20 results during the Harbinger portal roll and require rerolling of duplicates until all 3 results are unique.

#### Scenario: Duplicate roll detected

- **WHEN** the Harbinger player rolls 3 D20
- **AND** two or more dice show the same result
- **THEN** the system highlights the duplicate dice and prompts for reroll

#### Scenario: Selective reroll

- **WHEN** duplicate dice are highlighted
- **AND** the Harbinger player clicks a duplicate die
- **THEN** only that die is rerolled

#### Scenario: All unique results

- **WHEN** all 3 D20 show unique results
- **THEN** the system accepts the rolls as portal tile numbers (1-20 mapping: top-left = 1, bottom-right = 20, row-major order)

---

### Requirement: Portal State Synchronization

The system SHALL store portal tile locations in game state and synchronize them between players in online matches.

#### Scenario: Portal state stored

- **WHEN** the Harbinger portal roll completes
- **THEN** the portal tile numbers are stored in `GameState.portalState`

#### Scenario: Portal state synced

- **WHEN** portal state changes
- **AND** the game is an online match
- **THEN** the state is broadcast to the opponent via server patch

#### Scenario: Portal state restored on reconnect

- **WHEN** a player reconnects to an online match
- **AND** portal tiles were previously established
- **THEN** the portal overlay is immediately visible on the restored board

---

### Requirement: Portal Tile Visual Overlay

The system SHALL render a visible "portal" effect on designated tiles, displayed under cards but above the playmat.

#### Scenario: Portal overlay visible

- **WHEN** a tile is designated as a portal
- **THEN** an animated ring overlay is rendered on that tile in the owning player's color (blue for p1, red for p2)

#### Scenario: Overlay below cards

- **WHEN** a card or permanent is placed on a portal tile
- **THEN** the portal overlay remains visible around/under the card

#### Scenario: Overlay animation

- **WHEN** a portal overlay is rendered
- **THEN** it displays a subtle pulsing animation

#### Scenario: No overlay without portals

- **WHEN** no portal tiles are designated (no Harbinger in game)
- **THEN** no portal overlays are rendered

---

### Requirement: Both Players Have Harbinger

The system SHALL support games where both players have Harbinger avatars, allowing each player to roll their own portals.

#### Scenario: Dual Harbinger detection

- **WHEN** both players' avatars are detected as Harbinger
- **THEN** each player rolls their own set of 3 D20 dice

#### Scenario: Sequential portal rolls

- **WHEN** both players have Harbinger
- **THEN** Player 1 rolls first, then Player 2 rolls

#### Scenario: Separate portal overlays

- **WHEN** both players have established portals
- **THEN** each player's portals are rendered in their player color (blue for p1, red for p2)
