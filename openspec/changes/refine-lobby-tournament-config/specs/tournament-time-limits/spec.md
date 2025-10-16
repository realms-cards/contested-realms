# Tournament Time Limits

## ADDED Requirements

### Requirement: Sealed Deck Construction Time Limit
Tournament organizers SHALL be able to configure a time limit (warning-only) for sealed deck construction phases.

#### Scenario: Configure Sealed Time Limit During Tournament Creation
- GIVEN a tournament organizer is creating a sealed tournament
- WHEN the organizer is configuring sealed settings
- THEN a "Deck Construction Time Limit" field should be displayed
- AND the default value should be 40 minutes
- AND the valid range should be 10-90 minutes
- AND the field should accept integer values only

#### Scenario: Sealed Time Limit Stored in Database
- GIVEN a tournament organizer creates a sealed tournament with a 30-minute time limit
- WHEN the tournament is created
- THEN the time limit should be stored in `settings.sealedConfig.timeLimit`
- AND the value should be 30
- AND the tournament should be retrievable with this setting intact

#### Scenario: Display Sealed Time Limit on Tournament Page
- GIVEN a player joins a sealed tournament with a configured time limit
- WHEN the player views the tournament details
- THEN the time limit should be displayed prominently
- AND it should be clearly marked as "warning only"
- AND the format should be "X minutes"

### Requirement: Draft Pick Time Limit
Tournament organizers SHALL be able to configure a per-pick time limit (warning-only) for draft phases.

#### Scenario: Configure Draft Pick Time Limit During Tournament Creation
- GIVEN a tournament organizer is creating a draft tournament
- WHEN the organizer is configuring draft settings
- THEN a "Pick Time Limit" field should be displayed
- AND the default value should be 1 minute (60 seconds)
- AND the valid range should be 30-300 seconds
- AND the field should accept integer values only

#### Scenario: Draft Pick Time Limit Stored in Database
- GIVEN a tournament organizer creates a draft tournament with a 90-second pick time limit
- WHEN the tournament is created
- THEN the pick time limit should be stored in `settings.draftConfig.pickTimeLimit`
- AND the value should be 90
- AND the tournament should be retrievable with this setting intact

#### Scenario: Display Draft Pick Time Limit on Tournament Page
- GIVEN a player joins a draft tournament with a configured pick time limit
- WHEN the player views the tournament details
- THEN the pick time limit should be displayed
- AND it should be clearly marked as "warning only"
- AND the format should be "X seconds per pick"

### Requirement: Draft Deck Construction Time Limit
Tournament organizers SHALL be able to configure a time limit (warning-only) for draft deck construction after picks are complete.

#### Scenario: Configure Draft Construction Time Limit During Tournament Creation
- GIVEN a tournament organizer is creating a draft tournament
- WHEN the organizer is configuring draft settings
- THEN a "Deck Construction Time Limit" field should be displayed
- AND the default value should be 20 minutes
- AND the valid range should be 10-60 minutes
- AND the field should accept integer values only

#### Scenario: Draft Construction Time Limit Stored in Database
- GIVEN a tournament organizer creates a draft tournament with a 25-minute construction time limit
- WHEN the tournament is created
- THEN the construction time limit should be stored in `settings.draftConfig.constructionTimeLimit`
- AND the value should be 25
- AND the tournament should be retrievable with this setting intact

#### Scenario: Display Draft Construction Time Limit on Tournament Page
- GIVEN a player joins a draft tournament with a configured construction time limit
- WHEN the player views the tournament details
- THEN the construction time limit should be displayed
- AND it should be clearly marked as "warning only"
- AND the format should be "X minutes"

## MODIFIED Requirements

### Requirement: Tournament Configuration API
The system SHALL accept time limit configuration fields when creating tournaments.

**Updated Behavior:**
- POST `/api/tournaments` endpoint accepts `sealedConfig.timeLimit`
- POST `/api/tournaments` endpoint accepts `draftConfig.pickTimeLimit`
- POST `/api/tournaments` endpoint accepts `draftConfig.constructionTimeLimit`
- All time limit fields are optional with sensible defaults
- Invalid values are rejected with clear error messages

#### Scenario: Create Tournament with All Time Limits
- GIVEN a tournament organizer provides valid time limits for all phases
- WHEN POST `/api/tournaments` is called with sealedConfig containing timeLimit: 35
- THEN the tournament should be created successfully
- AND the response should include the configured time limit
- AND the database should store `settings.sealedConfig.timeLimit = 35`

#### Scenario: Reject Invalid Time Limits
- GIVEN a tournament organizer provides an out-of-range time limit
- WHEN POST `/api/tournaments` is called with `sealedConfig.timeLimit: 200`
- THEN the request should fail with status 400
- AND the error message should indicate the valid range (10-90 minutes)

#### Scenario: Use Default Time Limits When Not Specified
- GIVEN a tournament organizer does not specify time limits
- WHEN POST `/api/tournaments` is called without time limit fields
- THEN the tournament should be created with default time limits
- AND sealed tournaments should default to 40 minutes
- AND draft pick time should default to 60 seconds
- AND draft construction should default to 20 minutes
