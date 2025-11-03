## ADDED Requirements
### Requirement: Defense Assignment Window
When an attack is declared on a tile, the system SHALL present the defending player with a defense assignment window for that tile, allowing them to select which of their units/avatar at the tile will defend, and to optionally move additional defenders to the tile during the window.

- Defenders may be any friendly units already at the attacked tile and the friendly avatar if present at the tile.
- During the defense window, the defender MAY drag additional friendly units or the avatar from other tiles into the attacked tile; such arrivals SHALL become selectable as defenders.
- No movement/path/range validation is enforced in this phase.

#### Scenario: Open Defense Window
- **WHEN** an `attackDeclare` is broadcast for tile (x,y)
- **THEN** the defending player sees a compact HUD panel allowing defender selection

#### Scenario: Assign Defenders on Tile
- **WHEN** the defending player selects one or more friendly units/avatar already at the tile
- **THEN** the system records the selected defenders for that combat

#### Scenario: Drag-in Defenders Become Selectable
- **WHEN** the defending player drags a friendly unit/avatar from another tile into the attacked tile during the defense window
- **THEN** that unit/avatar becomes available for selection in the panel

#### Scenario: Submit Defenders
- **WHEN** the defending player clicks Done
- **THEN** the system broadcasts `combatSetDefenders` containing the chosen defenders

#### Scenario: Cancel Defense
- **WHEN** the defending player clicks Cancel
- **THEN** the system broadcasts `combatCancel` for that combat
