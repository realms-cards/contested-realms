# Lobby Configuration - Pack Size Removal

## REMOVED Requirements

### Requirement: Pack Size Configuration UI
Pack size is always 15 cards, making this setting unnecessary and confusing.

**Previous Behavior:**
- Draft configuration UI displayed a "Pack Size" input field
- Users could modify pack size between 8-20 cards
- Value was stored in `draftPackSize` state variable
- Value was passed to server in `draftConfig.packSize` payload field

#### Scenario: Remove Pack Size from Lobby Draft Configuration
- GIVEN a user is creating a lobby match with draft configuration
- WHEN the user opens the draft configuration modal
- THEN the "Pack Size" input field should NOT be displayed
- AND pack size should default to 15 internally

#### Scenario: Remove Pack Size from Tournament Draft Configuration
- GIVEN a tournament organizer is creating a draft tournament
- WHEN the organizer opens the draft configuration section
- THEN the "Pack Size" input field should NOT be displayed
- AND pack size should default to 15 internally

## MODIFIED Requirements

### Requirement: Draft Configuration Payload
The system SHALL use a constant pack size of 15 for all draft configurations.

**Updated Behavior:**
- `draftConfig.packSize` is always set to 15
- Users cannot modify pack size in UI
- Server continues to accept `packSize` field for backward compatibility

#### Scenario: Draft Configuration Uses Constant Pack Size
- GIVEN a user configures a draft match in a lobby
- WHEN the match is started
- THEN the `draftConfig` payload should include `packSize: 15`
- AND the server should generate packs with exactly 15 cards

#### Scenario: Tournament Draft Uses Constant Pack Size
- GIVEN a tournament organizer creates a draft tournament
- WHEN the tournament is created
- THEN the `draftConfig` should include `packSize: 15`
- AND all draft packs should contain exactly 15 cards
