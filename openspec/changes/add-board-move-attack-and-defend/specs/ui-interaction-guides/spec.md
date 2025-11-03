## ADDED Requirements
### Requirement: Interaction Guides Toggle and Guided Combat Prompts
The system SHALL provide an Interaction Guides feature flag (default OFF) that enables guided overlays for combat-related interactions on the board. When enabled, the system SHALL display:

- A chooser dialog after cross‑tile moves of units with base power onto a tile with valid enemy targets (Move only vs Move & Attack).
- A compact defense assignment panel for the defending player after an attack is declared.

#### Scenario: Feature Flag Default and Persistence
- **WHEN** a new session starts
- **THEN** Interaction Guides are OFF by default
- **AND** the player MAY toggle the feature in UI settings
- **AND** the setting SHALL persist locally across reloads

#### Scenario: Chooser Visibility Gated by Flag
- **WHEN** Interaction Guides are OFF
- **AND** a player moves a unit with base power onto a tile with valid enemy targets
- **THEN** no chooser is shown (movement proceeds as usual)

#### Scenario: Defense Panel Visibility Gated by Flag
- **WHEN** Interaction Guides are OFF
- **AND** an attack is declared
- **THEN** the compact defense assignment panel is not shown automatically (future non‑guided flows may still allow manual defense)
