## ADDED Requirements
### Requirement: Tournament Roster With Status
The system SHALL display a roster of all players on the tournament details page, replacing the bare n/N indicator.

- Each row SHALL show: display name, presence (online/offline), and a status derived from server state.
- Supported statuses: `joining`, `ready`, `drafting`, `constructing deck`, `playing match vs {opponent}` , `bye`, `waiting`.
- The roster SHALL update in near real-time (<2s) when players join/leave/toggle ready or phases change.
- The roster SHALL indicate the current user clearly (e.g., highlight or badge).

Status derivation guidelines (non-normative):
- `joining` = registered but not ready during preparing; `ready` = ready/submitted during preparing.
- `drafting` = player is part of active draft session; `constructing deck` = format constructed during preparation.
- `playing match vs X` = during an active round, use matches to resolve opponent name.
- `bye` or `waiting` = assigned a bye or not paired during the round.

#### Scenario: Preparing phase roster
- **WHEN** the tournament status is `preparing`
- **THEN** roster shows `joining` or `ready` and presence indicators per player

#### Scenario: Active round roster
- **WHEN** the tournament status is `active`
- **THEN** roster shows `playing match vs {opponent}` or `bye`/`waiting` accordingly

#### Scenario: Real-time updates
- **WHEN** the server emits presence/preparation/round updates
- **THEN** roster entries update within 2 seconds without a manual page reload
