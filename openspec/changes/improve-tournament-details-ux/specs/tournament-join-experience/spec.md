## ADDED Requirements
### Requirement: Real-time Match Join CTA
The system SHALL surface a persistent call-to-action to join a newly assigned match without requiring a manual reload.

- On round start or explicit match assignment, assigned players SHALL see a CTA within ~2 seconds on the tournament details page.
- The CTA SHALL include opponent name and round number if known, and a single-click Join that navigates to `/online/play/[matchId]`.
- The navigation SHALL bootstrap tournament context required by the online match page (tournamentId, matchType, configs if needed).
- A session-scoped toggle "Auto-join my match" MAY automatically navigate on assignment; default is OFF.
- A toast notification SHALL be shown even if the CTA is off-screen, clickable to open the CTA or navigate.

#### Scenario: Round starts and players are paired
- **WHEN** the host starts the round and the user is assigned a match
- **THEN** within ~2 seconds, a Join CTA is visible with opponent name
- **AND** clicking Join opens the online play page for that match with tournament bootstrap

#### Scenario: Missed socket event fallback
- **WHEN** the socket event is missed or the page is backgrounded
- **THEN** the page SHALL refresh relevant statistics and still surface the CTA within 15 seconds

#### Scenario: Auto-join enabled
- **WHEN** the user has enabled Auto-join
- **THEN** the client navigates automatically to the match page on assignment
- **AND** a toast informs the user (with a quick way to cancel back)
