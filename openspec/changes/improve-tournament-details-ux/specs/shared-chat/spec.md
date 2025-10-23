## ADDED Requirements
### Requirement: Shared Floating Chat
The system SHALL provide a reusable floating chat component anchored bottom-left that can be used on multiple pages.

- The component SHALL be collapsible/expandable and remember its open state per session.
- The component SHALL support scope-specific pipelines (initial scope: tournament chat on tournament details page).
- The component SHALL display a toast preview when a new message arrives while the component is collapsed.
- The component SHALL debounce repeated toasts (min 3s between previews) and truncate long messages.
- The component SHALL send messages via the existing socket channel for its scope (e.g., `TOURNAMENT_CHAT`).
- The tournament details page SHALL remove duplicate in-page chat controls and render only the floating chat.

#### Scenario: Receive message while collapsed
- **WHEN** a tournament chat message arrives and the floating chat is collapsed
- **THEN** a toast is shown within 0.5s with sender and a short preview
- **AND** clicking the toast opens the chat and focuses the input

#### Scenario: Send tournament chat message
- **WHEN** the user types and submits a message
- **THEN** the message is sent via `sendTournamentChat(tournamentId, content)`
- **AND** the input is cleared and the log auto-scrolls

#### Scenario: No tournament context
- **WHEN** the component is rendered without an active tournament
- **THEN** the send control is disabled and a hint explains chat is unavailable
