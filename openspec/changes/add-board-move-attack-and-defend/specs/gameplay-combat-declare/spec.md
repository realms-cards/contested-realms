## ADDED Requirements
### Requirement: Declare Attack on Board Move
The system SHALL allow a player to declare an attack immediately after moving an existing unit with base power onto a destination tile that contains one or more valid enemy targets, provided Interaction Guides are enabled.

- A valid target is any of:
  - An enemy unit (permanent with different owner) at the destination tile
  - An enemy avatar located at the destination tile
  - An enemy-controlled site at the destination tile
- If no valid enemy target exists at the destination tile, the system SHALL default to Move (no prompt).
- Same‑tile repositioning SHALL never trigger the attack chooser.

#### Scenario: Chooser Offered after Cross-Tile Move with Targets
- **WHEN** a player drags a unit with base power to a different tile that has enemy units/avatar or an enemy‑controlled site
- **AND** Interaction Guides are enabled
- **THEN** the system shows a chooser with options “Move only” and “Move & Attack”

#### Scenario: Default to Move When No Targets
- **WHEN** a player drags a unit with base power to a different tile with no valid enemy targets
- **THEN** the system completes the move with no chooser

#### Scenario: Same-Tile Repositioning
- **WHEN** a player drags a unit within the same tile (reposition)
- **THEN** the system completes the move with no chooser

#### Scenario: Declare Attack
- **WHEN** the player selects “Move & Attack” from the chooser
- **THEN** the system declares an attack for that tile and attacker and broadcasts an `attackDeclare` event
- **AND** the system enters a defense window for the opponent
