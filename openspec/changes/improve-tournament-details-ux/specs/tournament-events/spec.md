## ADDED Requirements
### Requirement: Tournament Events Feed
The system SHALL provide a real-time events feed for tournaments, shown in the floating console (Events tab) on the tournament details page.

- The feed SHALL display key tournament events in chronological order with timestamps.
- The feed SHALL include, at minimum: player joined, player left, player disconnected, player reconnected, presence updates, preparation status updates, phase changes, round started, match assigned.
- The feed SHALL update within ~2 seconds of the underlying event when connected to the tournament socket room.
- High-priority events (round started, match assigned) SHALL trigger a toast when the console is collapsed.
- The feed SHALL retain at least the last 200 events per tournament in-memory and prune older entries.
- The feed UI SHALL provide simple filters (e.g., Players, Phases, Matches) and an option to show only my-related events.
- Events SHALL be composed from the existing real-time socket events surfaced in `RealtimeTournamentContext` and formatted consistently.

#### Scenario: Player join/leave
- **WHEN** a player joins or leaves the tournament
- **THEN** the Events tab appends an entry with the player's name and action within ~2 seconds

#### Scenario: Disconnect/reconnect
- **WHEN** a player's connection status changes (offline/online)
- **THEN** the Events tab reflects the presence change and marks the player accordingly

#### Scenario: Phase change and round started
- **WHEN** the tournament phase changes or a round starts
- **THEN** the Events tab appends a phase/round entry and a toast is shown if the console is collapsed

#### Scenario: Match assignment
- **WHEN** the user is assigned a match
- **THEN** the Events tab shows the pairing (opponent name) and a toast appears; a Join CTA is visible on the page

#### Scenario: Missed/Background handling
- **WHEN** the page is backgrounded or an event is missed
- **THEN** the feed SHALL still reflect the event after the next statistics/refresh cycle (<= 15 seconds)
