# SOATC League Integration

External league integration for the "Sorcerers at the Core" Discord community's ranking system at https://ranking.sorcerersatthecore.com.

## ADDED Requirements

### Requirement: SOATC UUID Linking

The system SHALL allow users to link their SOATC account by storing their SOATC UUID.

#### Scenario: User enters valid SOATC UUID

- **GIVEN** a user is in User Settings
- **WHEN** they enter a valid SOATC UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
- **THEN** store the UUID in `User.soatcUuid`
- **AND** show a success confirmation

#### Scenario: User enables auto-detect

- **GIVEN** a user has entered their SOATC UUID
- **WHEN** they check "Auto-detect SOATC tournament matches"
- **THEN** store the preference as `User.soatcAutoDetect = true`

#### Scenario: User clears SOATC UUID

- **GIVEN** a user has a stored SOATC UUID
- **WHEN** they clear the UUID field and save
- **THEN** set `User.soatcUuid` to null
- **AND** set `User.soatcAutoDetect` to false

---

### Requirement: Tournament Participant Detection

The system SHALL check if a user is participating in an ongoing SOATC tournament where Realms.cards is allowed.

#### Scenario: User is a tournament participant

- **GIVEN** the user has a stored `soatcUuid`
- **AND** the SOATC API returns ongoing tournaments with `realms_cards_allowed: true`
- **WHEN** the user's UUID matches a participant in one of those tournaments
- **THEN** return `{ isParticipant: true, tournament: { id, name, gameType } }`

#### Scenario: User is not a tournament participant

- **GIVEN** the user has a stored `soatcUuid`
- **AND** the SOATC API returns tournaments but none contain the user's UUID
- **WHEN** checking tournament participation
- **THEN** return `{ isParticipant: false }`

#### Scenario: User has no SOATC UUID

- **GIVEN** the user has not linked their SOATC account
- **WHEN** checking tournament participation
- **THEN** return `{ isParticipant: false, noUuid: true }`

#### Scenario: SOATC API unavailable

- **GIVEN** the SOATC API is unreachable or returns an error
- **WHEN** checking tournament participation
- **THEN** return cached data if available (TTL 5 minutes), otherwise `{ isParticipant: false, error: "..." }`

---

### Requirement: Tournament Data Caching

The system SHALL cache SOATC tournament data to minimize API requests.

#### Scenario: Cache miss

- **GIVEN** no cached tournament data exists or cache is expired
- **WHEN** tournament participation is checked
- **THEN** fetch fresh data from SOATC API
- **AND** cache for 5 minutes

#### Scenario: Cache hit

- **GIVEN** valid cached tournament data exists (less than 5 minutes old)
- **WHEN** tournament participation is checked
- **THEN** use cached data without API call

---

### Requirement: League Match Detection

The system SHALL detect and flag matches between two SOATC tournament participants.

#### Scenario: Both players are participants with auto-detect enabled

- **GIVEN** both players have `soatcAutoDetect: true`
- **AND** both are participants in the same ongoing SOATC tournament
- **WHEN** the match starts
- **THEN** automatically flag as `isLeagueMatch: true` with tournament context

#### Scenario: Both players are participants but auto-detect not enabled

- **GIVEN** both players are participants in the same SOATC tournament
- **AND** at least one player has `soatcAutoDetect: false`
- **WHEN** the lobby is displayed to the host
- **THEN** show a "Count as SOATC League Match" checkbox (default unchecked)

#### Scenario: Only one player is a participant

- **GIVEN** only one player is an SOATC tournament participant
- **WHEN** the lobby is displayed
- **THEN** do not show the league match option

#### Scenario: Players are in different tournaments

- **GIVEN** both players are SOATC participants but in different ongoing tournaments
- **WHEN** the lobby is displayed
- **THEN** do not auto-detect; optionally show checkbox if host wants to flag manually

---

### Requirement: League Result Object Generation

The system SHALL generate a signed result object for league matches upon completion.

#### Scenario: League match completes with winner

- **GIVEN** a match flagged as `isLeagueMatch: true` completes
- **AND** one player wins
- **WHEN** generating the league result
- **THEN** produce a `LeagueMatchResult` object with:
  - `matchId`: Realms.cards match UUID
  - `tournamentId`: SOATC tournament UUID
  - `tournamentName`: Tournament display name
  - `player1` and `player2`: SOATC UUIDs, display names, Realms user IDs
  - `winnerId`: SOATC UUID of winner
  - `loserId`: SOATC UUID of loser
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
- **THEN** show a "SOATC League Result" card with:
  - Summary of the result (winner/loser or draw)
  - Tournament name
  - "Copy to Clipboard" button
  - "Download JSON" button
  - Instructions for submitting to SOATC

#### Scenario: Player copies result

- **GIVEN** the league result card is displayed
- **WHEN** the player clicks "Copy to Clipboard"
- **THEN** copy the JSON result object to clipboard
- **AND** show a success toast notification

#### Scenario: Player downloads result

- **GIVEN** the league result card is displayed
- **WHEN** the player clicks "Download JSON"
- **THEN** trigger a file download named `soatc-result-{matchId}.json`

---

### Requirement: League Match History

The system SHALL store and allow export of historical SOATC league matches.

#### Scenario: League match is stored

- **GIVEN** a league match completes
- **WHEN** the result is generated
- **THEN** persist the result in `SoatcMatchResult` table with tournament context

#### Scenario: User views league match history

- **GIVEN** a user has played SOATC league matches
- **WHEN** they visit the league match history page
- **THEN** display a list of their league matches with date, opponent, result, and tournament name

#### Scenario: User exports match history

- **GIVEN** a user is viewing their league match history
- **WHEN** they click "Export All"
- **THEN** download a JSON file containing all their SOATC league match results

---

### Requirement: HMAC Signature Generation

The system SHALL sign league result objects with HMAC-SHA256 using a shared secret.

#### Scenario: Generating signature

- **GIVEN** a `LeagueMatchResult` object (excluding the `signature` field)
- **WHEN** signing the result
- **THEN** compute `HMAC-SHA256(JSON.stringify(payload), SOATC_SHARED_SECRET)`
- **AND** encode as hex string

#### Scenario: Signature verification guidance

- **GIVEN** the SOATC system receives a result object
- **WHEN** verifying authenticity
- **THEN** extract `signature`, recompute HMAC on remaining fields, accept only if match

---

### Requirement: Feature Flag Control

The system SHALL gate all SOATC league features behind an environment variable.

#### Scenario: Feature disabled

- **GIVEN** `SOATC_LEAGUE_ENABLED` is not set or is `false`
- **WHEN** any SOATC league feature is accessed
- **THEN** behave as if the feature does not exist (no UI, no API responses)

#### Scenario: Feature enabled

- **GIVEN** `SOATC_LEAGUE_ENABLED` is `true`
- **AND** `SORCERERS_AT_THE_CORE_APITOKEN` is configured
- **WHEN** SOATC league features are accessed
- **THEN** enable full functionality
