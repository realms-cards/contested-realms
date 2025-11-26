## ADDED Requirements

### Requirement: Card Metadata API Caching

The card metadata API (`/api/cards/meta-by-variant`) SHALL cache responses in memory with a configurable TTL to reduce database queries for frequently-accessed, rarely-changing data.

#### Scenario: Cache hit returns cached data

- **WHEN** a request is made for card metadata that exists in cache
- **AND** the cache entry has not expired
- **THEN** the cached data SHALL be returned without a database query

#### Scenario: Cache miss queries database

- **WHEN** a request is made for card metadata not in cache
- **OR** the cache entry has expired
- **THEN** a database query SHALL be performed
- **AND** the result SHALL be cached for subsequent requests

#### Scenario: Cache key includes query parameters

- **WHEN** card metadata is requested with specific slugs and set
- **THEN** the cache key SHALL include all query parameters to prevent cross-request pollution

### Requirement: Dynamic Loading of 3D Components

3D rendering components (Board, Hand3D, Piles3D, Hud3D, TokenPile3D) SHALL be dynamically imported to enable code splitting and improve initial page load performance.

#### Scenario: 3D components load lazily

- **WHEN** a user navigates to the online play page
- **THEN** 3D components SHALL be loaded asynchronously after initial page render
- **AND** a loading placeholder SHALL be displayed while components load

#### Scenario: No SSR for 3D components

- **WHEN** the server renders the online play page
- **THEN** 3D components SHALL NOT be rendered on the server
- **AND** only the loading placeholder SHALL be included in initial HTML

### Requirement: Minimal Bundle Dependencies

The application SHALL NOT include unused dependencies in the production bundle.

#### Scenario: boardgame.io is removed

- **GIVEN** the application previously included boardgame.io
- **WHEN** the dependency is not used in any source file
- **THEN** it SHALL be removed from package.json
- **AND** the bundle size SHALL decrease accordingly
