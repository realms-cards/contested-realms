## Why

Gothic introduces a new per-deck "Collection" pile of cards that the controlling player can browse during a match and use as an additional resource. Today the game engine only understands libraries (Spellbook/Atlas), hand, graveyard, battlefield, and banished zones. We need a first-class, rules-aligned Collection zone so Gothic decks can use it without breaking existing decks or match persistence.

## What Changes

- Add an optional per-player `Collection` zone to the game state, alongside Spellbook, Atlas, hand, graveyard, battlefield, and banished.
- Allow the controlling player to open a Collection view during a match to inspect the contents of their Collection without revealing it to the opponent.
- Allow the controlling player to move selected cards from their Collection to their hand via an explicit action, with timing legality enforced according to the active format.
- Ensure deck loading, match persistence, and server zone normalization treat `Collection` as optional and keep existing decks valid when it is absent.
- Optionally extend deck/tournament APIs so Gothic decks can declare Collection cards, while remaining backwards compatible for decks that do not use Collection.

## Impact

- Affected specs (capabilities):
  - gameplay-zones (new Collection zone, visibility, and movement semantics)
  - deck-construction (optional: how decks declare Collection cards for Gothic)
- Affected code (indicative):
  - Client: game store zones/types, zone helpers, pile/zone UI (e.g., `PileZones`, `PileSearchDialog`), deck loading.
  - Server: match state zones normalization and patch handling in the match leader.
  - Data/API: deck/tournament endpoints that may carry Collection metadata for Gothic decks.
