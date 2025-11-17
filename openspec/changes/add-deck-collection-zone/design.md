## Context

The Gothic set introduces a new per-deck "Collection" pile of cards. During a match, the controlling player can inspect their Collection and move cards from it to hand under certain timing rules. Today, the engine models Spellbook/Atlas libraries, hand, graveyard, battlefield, and banished zones, but there is no concept of Collection.

This change spans the client game store, in-game UI, server match persistence, and (optionally) deck/tournament APIs.

## Goals / Non-Goals

- Goals:
  - Represent Collection as a first-class per-player zone in game state.
  - Allow the controlling player to view their Collection without revealing it to the opponent.
  - Allow explicit, legal moves from Collection to hand that are synchronized across clients and persisted on the server.
  - Keep existing decks and matches valid when Collection is absent.
- Non-Goals:
  - Redesigning the deck editor to surface Collection as a full UX flow.
  - Defining Gothic card-level rules beyond the basic zone semantics.
  - Changing existing hand/library/graveyard rules.

## Decisions

- Decision: Model Collection as an optional per-player zone `zones[seat].collection: CardRef[]` in both client and server state, defaulting to an empty list when unspecified.
- Decision: Reuse the existing pile search UI (`PileSearchDialog`) as the primary UX for browsing Collection, rather than introducing a bespoke viewer.
- Decision: Treat Collection as a private zone: only the controlling player can see its contents; opponents never see individual cards.
- Decision: Keep deck validity independent of Collection: decks remain legal if they never declare a Collection zone.
- Decision: Restrict moves from Collection to hand to the controlling players own turn while the game phase is Main.

## Risks / Trade-offs

- Risk: Timing rules for moving cards from Collection to hand may differ across Gothic formats.
  - Mitigation: Capture timing as an explicit requirement and leave enforcement configurable per format. Start with a conservative default (e.g., controlling player's Main phase only) and validate against the rulebook before relaxing.
- Risk: Mixed-version clients and servers may ignore or drop the `collection` field.
  - Mitigation: Treat `collection` as optional; ensure normalization tolerates missing data; gate UI behind a feature flag and deploy server support before enabling it in the client.
- Risk: UX complexity if Collection grows large.
  - Mitigation: Start with a simple searchable list and only optimize (e.g., filters, grouping) if playtesting shows the need.

## Migration Plan

1. Add `collection` to client and server zone types with safe defaults; deploy without enabling UI.
2. Update deck loaders and tournament flows to populate `collection` for Gothic decks where available.
3. Enable Collection view and Collection-to-hand actions behind a feature flag in client.
4. Remove or relax the feature flag once Gothic is stable in production and timing rules are confirmed.

## Open Questions

- Should Collection contents be visible in post-game logs, replays, or deck summaries?
- Should deck construction tools surface Collection as a first-class section, or should Collection primarily be defined via tournament/deck APIs for now?
