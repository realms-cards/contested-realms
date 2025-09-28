# Data Model: All Players MVP (Conceptual)

## Entities

- Player
  - Attributes: userId (internal), shortUserId (human‑friendly), displayName, avatar (reference), discoverability (visible/hidden)
  - Relationships: may appear in FriendsList entries; may appear in RecentInteraction records

- Presence
  - Attributes: online (boolean), inMatch (boolean), lastSeenAt (timestamp), presenceVisible (boolean)
  - Eligibility: a Player appears in All Players when online = true AND inMatch = false AND presenceVisible = true

- FriendsList (entry)
  - Attributes: ownerUserId, targetUserId, createdAt
  - Behavior: duplicates prevented; adding is manual (no auto‑friending)

- RecentInteraction (derived record)
  - Attributes: ownerUserId, opponentUserId, count (matches within last 10), lastPlayedAt
  - Usage: determines prioritization (frequency desc, then lastPlayedAt desc)

## Relationships

- Player 1‑to‑many FriendsList (owner → entries)
- Player many‑to‑many via FriendsList (owner ↔ target)
- Player 1‑to‑many RecentInteraction (owner → records)

## State Transitions (Presence)

- offline → online (eligible if inMatch = false and presenceVisible = true)
- online → inMatch (becomes ineligible)
- presenceVisible toggle (eligible only when true)

## Validation (Conceptual)

- shortUserId: short, human‑friendly string; displayed wherever ambiguity may occur.
- displayName: case‑insensitive search; special characters supported.
- Discoverability default: Visible; changeable by user at first‑run prompt.
