# Research: All Players MVP for Online Lobby

## Decisions and Rationale

- Decision: Availability = online and not in a match; presence must be visible
  - Rationale: Ensures the list reflects players who can immediately respond to invites; avoids user frustration from inviting busy players.
  - Alternatives: Show all online (including in-match) — rejected for poor UX; Show “Do Not Disturb” — deferred to future enhancement.

- Decision: Prioritization uses last 10 matches; within that group, order by highest frequency, ties by most recent
  - Rationale: Stable, easy to reason about, and reinforces reconnecting with recent opponents.
  - Alternatives: Last N days — variable by activity; purely alphabetical — loses intent signal.

- Decision: Discoverability default is Visible with a first‑run prompt; hidden users do not appear
  - Rationale: Frictionless discovery while preserving privacy control from the start.
  - Alternatives: Hidden by default — reduces discoverability; forced visible — privacy concerns.

- Decision: Identity shows Avatar, Display Name, short human‑friendly UserID
  - Rationale: Disambiguates duplicate names with minimal visual noise.
  - Alternatives: Full internal ID — too technical; no ID — ambiguity remains.

- Decision: List shows up to 100 initially; progressive load (infinite scroll)
  - Rationale: Predictable performance for large populations; reduces initial payload and layout cost.
  - Alternatives: Full list load — memory/performance risk; paginated pages — acceptable but lower UX for discovery.

- Decision: Sorting toggle between “Recent first” and “Alphabetical”; remember choice for the session
  - Rationale: Gives control for both social intent and predictable browsing.
  - Alternatives: One fixed sorting — less flexible.

- Decision: Search by display name (case‑insensitive)
  - Rationale: Matches user mental model; avoids exposing or relying on technical identifiers.
  - Alternatives: Search by short ID — niche; fuzzy across multiple fields — overkill for MVP.

## Patterns and Considerations

- Infinite scroll: incremental fetch with a stable cursor; ensure no duplicates on merge; guard against re‑ordering jitter when presence changes.
- Debounced search: small debounce (100–200ms) to balance responsiveness vs. request spam.
- Prioritization: compute recent-opponent set client‑ or server‑side; ensure deterministic sort (frequency → recency → display name) to avoid flicker.
- Privacy & consent: presence visibility respected on all list endpoints; hidden users never returned.
- Large populations: initial 100 cap, O(1) append; avoid heavy client sorting on large sets.
- Error handling: availability may change between render and action; actions must be idempotent and return clear user messages.

## Risks

- Rapid presence churn may cause items to move; mitigate with stable sort keys and minimal reflow.
- Duplicate or similar names may still cause confusion; short IDs must be consistently visible.
- Invite or add‑friend races (target becomes unavailable or already a friend) — ensure atomic checks server‑side.

## Open Items

- None; core clarifications resolved in spec Clarifications section.
