## Context
The current tournament flow assumes a fixed player cap and deletes registrations on leave. That breaks continuity for deck submissions and makes mid-event replacements impossible. We need an "open seat" mode where hosts can lock registration when ready, and vacated seats can be re-filled without restarting the event.

## Goals / Non-Goals
- Goals:
  - Support open seat tournaments with host-controlled registration lock.
  - Allow players to leave at any phase while preserving the seat's deck and record.
  - Allow replacements to inherit the vacated seat's deck and standings.
  - Keep Swiss scoring rules (3/1/0) consistent with existing tournaments.
- Non-Goals:
  - Rework matchmaking beyond tournament scope.
  - Allow mid-match seat takeovers (replacement happens between rounds).

## Decisions
- Decision: Add an "open seat" registration mode in tournament settings.
  - The mode is stored in `tournament.settings.registration` with `mode` and `locked` fields.
- Decision: Preserve seat continuity by treating the registration record as the seat.
  - Add `seatStatus` to `TournamentRegistration` (active | vacant) and a lightweight `seatMeta` JSON for history.
- Decision: Replacement updates are handled by an identity transfer in tournament data.
  - When a replacement joins, the system updates the tournament registration, standings, and tournament match data from the old player ID to the new player ID so the record stays consistent.
- Decision: Departures during an active round are treated as forfeits.
  - The seat is marked vacant for the remainder of the round; replacement can claim before the next round.

## Risks / Trade-offs
- Rewriting historical match records to transfer seat identity is invasive but keeps tiebreakers consistent.
- Allowing large open seat events may stress pairing/standings queries; a system cap is still required.

## Migration Plan
1. Add `SeatStatus` enum and fields to `TournamentRegistration`.
2. Backfill existing registrations as `active` with empty `seatMeta`.
3. Deploy API and UI updates behind the open seat mode flag.

## Open Questions
- Should hosts be allowed to unlock registration after round 1, or only between rounds?
- What system-level cap (if any) should apply to open seat tournaments?
