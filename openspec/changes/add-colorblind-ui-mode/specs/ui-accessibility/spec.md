# UI Accessibility - Color Blind Mode

## ADDED Requirements

### Requirement: Per-User Color Blind Mode Setting

The system SHALL provide a per-user Color blind mode setting that controls whether the UI uses a color-blind-friendly semantic palette and associated non-color cues.

- The setting SHALL be persisted on the authenticated user account when available.
- The setting SHALL be persisted in localStorage for guests or when a user record is not available.
- The effective setting SHALL be available to the client as a simple boolean flag.

#### Scenario: Authenticated user enables Color blind mode

- **WHEN** an authenticated user opens the User Badge advanced options
- **AND** enables the "Color blind mode" toggle
- **THEN** the client SHALL update the effective Color blind mode flag to `true`
- **AND** the UI SHALL update immediately to use the color-blind palette and cues
- **AND** the setting SHALL be saved to the user's profile so that future sessions use Color blind mode by default

#### Scenario: Authenticated user disables Color blind mode

- **WHEN** an authenticated user disables the "Color blind mode" toggle
- **THEN** the client SHALL update the effective Color blind mode flag to `false`
- **AND** the UI SHALL revert immediately to the default palette and cues
- **AND** the setting SHALL be saved to the user's profile

#### Scenario: Guest user enables Color blind mode

- **WHEN** a non-authenticated user enables the "Color blind mode" toggle
- **THEN** the client SHALL update the effective Color blind mode flag to `true`
- **AND** the UI SHALL update immediately to use the color-blind palette and cues
- **AND** the setting SHALL be persisted in localStorage
- **AND** on future visits in the same browser, Color blind mode SHALL remain enabled until explicitly disabled

---

### Requirement: Color Blind Mode Toggle in User Badge

The system SHALL expose the Color blind mode setting as a toggle in the User Badge advanced options (gear icon), accessible from pages where the User Badge is present.

- The toggle SHALL be clearly labeled (e.g., "Color blind mode").
- The toggle SHALL reflect the current effective mode (on/off) at render time.
- Changing the toggle SHALL update both local state and persisted settings (user or localStorage).

#### Scenario: Toggle reflects current state

- **WHEN** a user opens the User Badge advanced options
- **THEN** the Color blind mode toggle SHALL display "on" when Color blind mode is enabled
- **AND** SHALL display "off" when Color blind mode is disabled

#### Scenario: Toggle updates setting and UI

- **WHEN** a user changes the Color blind mode toggle
- **THEN** the effective Color blind mode flag SHALL update within the current session
- **AND** the UI SHALL re-render overlays and interface pieces using the appropriate palette and cues
- **AND** the new value SHALL be persisted (user profile or localStorage) without requiring a full page reload

---

### Requirement: Color-Blind-Safe Semantic Color Palette

The system SHALL define and use semantic color tokens for key UI roles, with variants for default and Color blind modes.

- Semantic tokens SHALL include, at minimum:
  - Ally vs enemy (e.g., `--color-ally`, `--color-enemy`)
  - Success, error, warning, info
  - Selection, hover, target-legal, target-illegal
  - Positive highlight, negative highlight
- The default palette SHALL maintain current visual identity (subject to minor adjustments as needed).
- The Color blind palette SHALL use color pairs that are distinguishable for common red/green color vision deficiencies and maintain adequate contrast.

#### Scenario: Ally vs enemy colors switch in Color blind mode

- **WHEN** Color blind mode is enabled
- **THEN** elements that indicate "my" vs "opponent" status (e.g., player badges, outlines, HUD markers) SHALL use the ally/enemy semantic tokens
- **AND** in Color blind mode those tokens SHALL resolve to a color pair that is distinguishable for red/green color vision deficiencies
- **AND** the pair SHALL remain clearly differentiable in grayscale

#### Scenario: Success and error states use semantic tokens

- **WHEN** the UI displays success or error states (e.g., toast, banner, inline validation)
- **THEN** those components SHALL use semantic tokens for success/error colors instead of hard-coded hues
- **AND** in Color blind mode the success vs error colors SHALL remain visually distinct and meet reasonable contrast guidelines against their backgrounds

#### Scenario: Target-legal vs target-illegal cues use semantic tokens

- **WHEN** the game UI renders legal and illegal target states (e.g., on hover or selection)
- **THEN** the visual representation (outlines, glows, markers) SHALL use `target-legal` and `target-illegal` semantic tokens
- **AND** in Color blind mode those tokens SHALL resolve to color pairs that are distinguishable for red/green color vision deficiencies

---

### Requirement: Non-Color Cues for Critical States

The system SHALL provide at least one non-color cue (icon, shape, pattern, or position) in addition to color for critical states where incorrect interpretation would meaningfully affect gameplay or navigation.

- Critical states include, at minimum:
  - Legal vs illegal targets.
  - Ally vs enemy / my vs opponent markers.
  - Success vs error vs warning messages.
  - Severe statuses such as Deaths Door or disabled/locked states.

#### Scenario: Legal vs illegal targets have distinct outlines

- **WHEN** a user is choosing targets in the game UI
- **THEN** legal targets SHALL be indicated by a specific outline style (e.g., solid or specific thickness)
- **AND** illegal targets SHALL be indicated by a different outline style (e.g., dashed or different shape)
- **AND** these styles SHALL differ even when viewed in grayscale

#### Scenario: Status messages include icons

- **WHEN** a success, error, or warning toast/banner is displayed
- **THEN** the message SHALL include an icon (e.g., checkmark, cross, warning triangle) in addition to color
- **AND** the icon SHALL remain visible and understandable even if viewed on a grayscale display

#### Scenario: Ally vs enemy markers include shape or position cues

- **WHEN** the UI indicates which side a permanent, avatar, or player belongs to
- **THEN** there SHALL be at least one additional cue beyond color (e.g., icon, corner marker, orientation, or consistent side of HUD)
- **AND** this cue SHALL remain visible in both default and Color blind modes

---

### Requirement: Card Art and 3D Scene Colors Remain Unaltered

The system SHALL NOT recolor or post-process card art or the 3D scene using a global color filter when Color blind mode is enabled.

#### Scenario: Card art remains unchanged

- **WHEN** Color blind mode is enabled
- **THEN** card art textures and images SHALL render with their original colors
- **AND** only overlays, HUD, and interface components SHALL switch to the Color blind palette

#### Scenario: 3D scene is not globally filtered

- **WHEN** Color blind mode is enabled
- **THEN** the system SHALL NOT apply a global CSS filter or post-processing effect that alters the entire rendered scene
- **AND** color adjustments SHALL be limited to UI, overlays, and markers that the client controls directly
