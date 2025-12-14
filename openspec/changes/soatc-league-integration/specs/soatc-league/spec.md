# SOATC League Integration

External league integration for the "Sorcerers at the Core" Discord community.

## ADDED Requirements

### Requirement: Discord ID Resolution

The system SHALL resolve a user's Discord ID from their linked OAuth account.

#### Scenario: User signed in via Discord

- **GIVEN** a user authenticated via Discord OAuth
- **WHEN** the system queries for their Discord ID
- **THEN** return the `providerAccountId` from the Account table where `provider = "discord"`

#### Scenario: User not signed in via Discord

- **GIVEN** a user authenticated via email or passkey only
- **WHEN** the system queries for their Discord ID
- **THEN** return null and indicate Discord linking is required

---

### Requirement: League Participant Detection

The system SHALL check if a user is participating in the current SOATC monthly league.

#### Scenario: User is a league participant

- **GIVEN** the SOATC participants API returns a list containing the user's Discord ID
- **WHEN** checking league participation status
- **THEN** return `{ isParticipant: true, leagueId: "soatc-YYYY-MM", leagueName: "..." }`

#### Scenario: User is not a league participant

- **GIVEN** the SOATC participants API does not include the user's Discord ID
- **WHEN** checking league participation status
- **THEN** return `{ isParticipant: false }`

#### Scenario: SOATC API unavailable

- **GIVEN** the SOATC participants API is unreachable or returns an error
- **WHEN** checking league participation status
- **THEN** return cached data if available, otherwise `{ isParticipant: false, error: "..." }`

---

### Requirement: League Match Flagging

The system SHALL allow the lobby host to flag a match as a league match when both players are league participants.

#### Scenario: Both players are league participants

- **GIVEN** both players in a lobby are identified as SOATC league participants
- **WHEN** the lobby is displayed to the host
- **THEN** show a "Count as SOATC League Match" checkbox (default unchecked)

#### Scenario: Only one player is a league participant

- **GIVEN** only one player in the lobby is a SOATC league participant
- **WHEN** the lobby is displayed
- **THEN** do not show the league match checkbox

#### Scenario: Host enables league match

- **GIVEN** the host checks "Count as SOATC League Match"
- **WHEN** the match starts
- **THEN** set `isLeagueMatch: true` on the match state

---

### Requirement: League Result Object Generation

The system SHALL generate a signed result object for league matches upon completion.

#### Scenario: League match completes with winner

- **GIVEN** a match flagged as `isLeagueMatch: true` completes
- **AND** one player wins
- **WHEN** generating the league result
- **THEN** produce a `LeagueMatchResult` object with:
  - `matchId`: Realms.cards match UUID
  - `leagueId`: Current league identifier
  - `player1` and `player2`: Discord IDs, display names, Realms user IDs
  - `winnerId`: Discord ID of winner
  - `loserId`: Discord ID of loser
  - `isDraw`: false
  - `format`: Match format (constructed/sealed/draft)
  - `startedAt`, `completedAt`: ISO 8601 timestamps
  - `durationSeconds`: Match duration
  - `replayId`, `replayUrl`: Replay reference
  - `timestamp`: Generation timestamp
  - `signature`: HMAC-SHA256 of payload

#### Scenario: League match ends in draw

- **GIVEN** a match flagged as `isLeagueMatch: true` ends in a draw
- **WHEN** generating the league result
- **THEN** produce a `LeagueMatchResult` object with `winnerId: null`, `loserId: null`, `isDraw: true`

---

### Requirement: Result Object Display

The system SHALL display the league result object to both players after a league match.

#### Scenario: Match ends and result is shown

- **GIVEN** a league match has completed
- **WHEN** the match end screen is displayed
- **THEN** show a "League Result" card with:
  - Summary of the result (winner/loser or draw)
  - "Copy Result" button
  - Instructions for submitting to SOATC

#### Scenario: Player copies result

- **GIVEN** the league result card is displayed
- **WHEN** the player clicks "Copy Result"
- **THEN** copy the JSON result object to clipboard
- **AND** show a success toast notification

---

### Requirement: HMAC Signature Verification

The system SHALL sign league result objects with HMAC-SHA256 using a shared secret.

#### Scenario: Generating signature

- **GIVEN** a `LeagueMatchResult` object (excluding the `signature` field)
- **WHEN** signing the result
- **THEN** compute `HMAC-SHA256(JSON.stringify(payload), SOATC_SHARED_SECRET)`
- **AND** encode as hex string

#### Scenario: Verifying signature (SOATC side)

- **GIVEN** a received `LeagueMatchResult` object
- **WHEN** SOATC verifies the signature
- **THEN** extract `signature`, recompute HMAC on remaining fields
- **AND** accept only if signatures match

---

### Requirement: Feature Flag Control

The system SHALL gate all SOATC league features behind an environment variable.

#### Scenario: Feature disabled

- **GIVEN** `SOATC_LEAGUE_ENABLED` is not set or is `false`
- **WHEN** any SOATC league feature is accessed
- **THEN** behave as if the feature does not exist (no UI, no API responses)

#### Scenario: Feature enabled

- **GIVEN** `SOATC_LEAGUE_ENABLED` is `true`
- **AND** required config (`SOATC_LEAGUE_API_URL`, `SOATC_SHARED_SECRET`) is present
- **WHEN** SOATC league features are accessed
- **THEN** enable full functionality
