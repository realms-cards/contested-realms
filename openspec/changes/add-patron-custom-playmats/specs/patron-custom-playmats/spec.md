## ADDED Requirements

### Requirement: Patron Gating

The system SHALL restrict custom playmat creation, editing, and selection to users with a non-null `patronTier`.

#### Scenario: Non-Patron attempts to access editor

- **WHEN** a non-Patron navigates to the custom playmat editor
- **THEN** the system prevents access and shows a Patron-only message

#### Scenario: Non-Patron attempts to call playmat API

- **WHEN** a non-Patron calls an API endpoint for custom playmats
- **THEN** the system returns an authorization error

### Requirement: Private Storage

The system SHALL store custom playmats as private user data in Postgres and only allow the owning user to read the playmat image bytes.

#### Scenario: Owner fetches playmat

- **WHEN** the owning user requests their custom playmat image
- **THEN** the system returns the image bytes

#### Scenario: Different user attempts to fetch playmat

- **WHEN** a different authenticated user requests a playmat they do not own
- **THEN** the system returns an authorization error

### Requirement: Upload Limit

The system SHALL allow each Patron to store at most 5 custom playmats.

#### Scenario: Patron reaches limit

- **WHEN** a Patron who already has 5 custom playmats attempts to create a 6th
- **THEN** the system rejects the request with a limit error

### Requirement: Fixed Export Dimensions

The system SHALL only accept/play custom playmats that are exported as exactly 2556×1663 pixels.

#### Scenario: Valid export saved

- **WHEN** the editor exports and uploads a 2556×1663 image
- **THEN** the system stores it successfully

#### Scenario: Invalid dimensions rejected

- **WHEN** a client attempts to upload a playmat that is not 2556×1663
- **THEN** the system rejects the upload

### Requirement: Editor Pan/Zoom Workflow

The system SHALL provide an editor that lets a Patron upload an image and adjust pan/zoom to fit the fixed export frame.

#### Scenario: Patron adjusts image before saving

- **WHEN** a Patron drags to reposition and zooms the image
- **THEN** the preview updates and the exported PNG matches the preview framing

### Requirement: Grid Preview Toggle

The system SHALL allow toggling the official grid overlay in the editor preview without baking it into the saved playmat.

#### Scenario: Grid preview enabled

- **WHEN** the Patron enables grid preview
- **THEN** the grid overlay is visible on top of the image preview

#### Scenario: Saved playmat excludes grid

- **WHEN** the Patron saves the playmat
- **THEN** the stored playmat image does not include the grid overlay

### Requirement: Playmat Selection

The system SHALL allow selecting a playmat from:

- standard built-in playmats (current and future)
- the user’s uploaded custom playmats

#### Scenario: User selects a custom playmat

- **WHEN** the user selects a custom playmat
- **THEN** the board uses that playmat in subsequent matches

#### Scenario: User selects the standard playmat

- **WHEN** the user selects the standard playmat
- **THEN** the board uses the standard playmat
