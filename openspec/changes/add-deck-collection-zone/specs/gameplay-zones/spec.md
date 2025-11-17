## ADDED Requirements

### Requirement: Collection Zone For Player Decks

The system SHALL support an optional per-player Collection zone as part of game state.

- Each player MAY have zero or more cards in their Collection zone.
- The Collection zone SHALL be associated with a deck (not the shared board) and persisted alongside other zones (Spellbook, Atlas, hand, graveyard, battlefield, banished).
- When no Collection information is provided for a deck, the system SHALL treat the Collection as empty and consider the deck valid.

#### Scenario: Deck Without Collection

- **WHEN** a match is started using a deck that does not specify any Collection cards
- **THEN** the game SHALL initialize that players Collection zone as empty
- **AND** the deck SHALL pass validation for formats that do not require a Collection

#### Scenario: Deck With Collection

- **WHEN** a match is started using a deck that specifies Collection cards
- **THEN** the game SHALL initialize the players Collection zone from those cards
- **AND** those cards SHALL not be placed into the players Spellbook, Atlas, hand, or graveyard at game start

### Requirement: Collection Visibility And Access

The system SHALL allow the controlling player to view their Collection without revealing it to the opponent.

- The controlling player SHALL be able to open a UI view listing all cards in their Collection during a match.
- The opponent SHALL NOT see the contents of another players Collection (only their own, if any).
- Collection viewing SHALL be available regardless of current phase or turn, unless restricted by future rules.

#### Scenario: Owner Views Collection

- **WHEN** a player with one or more cards in their Collection opens the Collection view
- **THEN** the UI SHALL list all Collection cards for that player in a searchable, scrollable list
- **AND** the opponent SHALL not see those cards in their own UI

### Requirement: Moving Cards From Collection To Hand

The system SHALL allow the controlling player to move cards from their Collection to their hand using an explicit action.

- The controlling player SHALL be able to select any card from their Collection and request it to be moved to their hand.
- On approval, the selected card SHALL be removed from the Collection zone and added to the players hand zone, and this change SHALL be synchronized to all connected clients and the server.
- The system SHALL only permit a Collection-to-hand move during the controlling players own turn while the game phase is Main, unless a future format explicitly specifies a stricter rule.

#### Scenario: Successful Collection-To-Hand Move

- **WHEN** the controlling player selects a card from their Collection during their own turn while the game phase is Main
- **THEN** the system SHALL move that card from Collection to that players hand
- **AND** the move SHALL be reflected in game logs or events and synchronized to opponent clients without revealing the cards identity beyond what hand visibility rules allow

#### Scenario: Illegal Collection-To-Hand Move

- **WHEN** the controlling player attempts to move a card from their Collection to hand at a time other than their own Main phase (or otherwise contrary to stricter format rules)
- **THEN** the system SHALL reject the action
- **AND** the Collection and hand zones SHALL remain unchanged
- **AND** the client MAY display a non-intrusive message explaining that the action is not currently allowed
