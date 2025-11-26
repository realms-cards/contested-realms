## ADDED Requirements

### Requirement: Global Shared WebGL Context

The application SHALL provide a single shared WebGL context for all 3D rendering to eliminate context loss from page navigation.

#### Scenario: Single context across pages

- **GIVEN** the user navigates between 3D pages (game, draft, replay, editor)
- **WHEN** each page renders its 3D content
- **THEN** all pages SHALL share the same WebGL context
- **AND** no context loss events SHALL occur from navigation alone

#### Scenario: Context loss recovery

- **GIVEN** a WebGL context loss event occurs (e.g., GPU reset)
- **WHEN** the context is restored
- **THEN** all active views SHALL automatically recover
- **AND** a warning SHALL be logged for debugging

### Requirement: Independent View Rendering

Each SceneView component SHALL render as an independent viewport with its own camera and controls.

#### Scenario: Multiple views with separate controls

- **GIVEN** two SceneView components are mounted
- **WHEN** the user interacts with OrbitControls in one view
- **THEN** only that view's camera SHALL be affected
- **AND** the other view SHALL remain unchanged

#### Scenario: View visibility

- **GIVEN** a SceneView component
- **WHEN** the component is unmounted
- **THEN** its viewport SHALL stop rendering
- **AND** GPU resources SHALL remain available for other views

### Requirement: Backward Compatibility

The global canvas system SHALL support incremental migration from existing Canvas components.

#### Scenario: Mixed Canvas and SceneView

- **GIVEN** a page using traditional Canvas
- **AND** another page using SceneView
- **WHEN** the user navigates between them
- **THEN** both SHALL render correctly
- **AND** no errors SHALL occur

#### Scenario: Feature flag control

- **GIVEN** the environment variable `NEXT_PUBLIC_GLOBAL_CANVAS_ENABLED` is set to "false"
- **WHEN** pages render
- **THEN** they SHALL use traditional Canvas components
- **AND** no global canvas SHALL be created
