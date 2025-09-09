# Data Model: Burrow/Submerge Mechanics

**Feature**: Permanent Burrow/Submerge Mechanics  
**Date**: 2025-01-09

## Core Entities

### PermanentPositionState
Represents the vertical positioning state of a permanent in 3D space.

**Fields**:
- `state: 'surface' | 'burrowed' | 'submerged'` - Current position state
- `depth: number` - Y-axis offset for 3D rendering (-0.1 to -0.5 for underground)
- `transitionDuration: number` - Animation time in milliseconds (default: 200ms)

**Validation Rules**:
- `state` must be one of the three defined values
- `depth` must be negative for burrowed/submerged, zero for surface
- `transitionDuration` must be positive integer between 100-500ms

**State Transitions**:
```
surface → burrowed (via context menu action)
surface → submerged (via context menu action, water sites only)
burrowed → surface (via "Surface" context menu)
submerged → surface (via "Emerge" context menu)
burrowed ↔ submerged (not allowed - must surface first)
```

### SitePositionData
Contains positioning information for sites placed on game tiles.

**Fields**:
- `siteId: number` - Unique site identifier
- `tileCoordinates: {x: number, z: number}` - Tile grid position
- `edgePosition: {x: number, z: number}` - Offset from tile center toward owning player
- `ownerPlayerPosition: {x: number, z: number}` - Reference point for edge calculation
- `placementAngle: number` - Angle in radians toward player (0-2π)

**Validation Rules**:
- `siteId` must be unique positive integer
- `tileCoordinates` must be within game board bounds
- `edgePosition` offset magnitude must be ≤0.4 (keeps within tile bounds)
- `placementAngle` must be 0 ≤ angle ≤ 2π

**Relationships**:
- One SitePositionData per site entity
- Referenced by permanent entities for position calculations

### BurrowAbility  
Metadata for permanent cards that can use burrow or submerge abilities.

**Fields**:
- `permanentId: number` - Links to permanent card
- `canBurrow: boolean` - Whether permanent can use burrow ability
- `canSubmerge: boolean` - Whether permanent can use submerge ability  
- `requiresWaterSite: boolean` - Whether submerge requires water-type site
- `abilitySource: string` - Card text/rule reference for ability

**Validation Rules**:
- At least one of `canBurrow` or `canSubmerge` must be true
- If `canSubmerge` is true, `requiresWaterSite` should be validated against site type
- `abilitySource` should reference specific card rule text

**Relationships**:
- One-to-one with permanent cards that have these abilities
- Used by context menu system to determine available actions

### ContextMenuAction
Dynamic actions available in right-click context menus for permanents.

**Fields**:
- `actionId: string` - Unique identifier (e.g., "burrow", "surface", "submerge")
- `displayText: string` - User-visible action name
- `icon?: string` - Optional icon identifier
- `isEnabled: boolean` - Whether action is currently available
- `targetPermanentId: number` - Permanent this action applies to
- `newPositionState?: PermanentPositionState` - Resulting state if action is taken

**Validation Rules**:
- `actionId` must be unique within the context menu
- `displayText` must be non-empty and ≤20 characters
- `isEnabled` calculated based on current game state and permanent abilities
- `newPositionState` required for position-changing actions

**Relationships**:
- Generated dynamically based on permanent abilities and current state
- Consumed by ContextMenu component for rendering

## Extended Entities (Modifications to Existing)

### GameCard (Extended)
Adds burrow/submerge capability tracking to existing card data.

**New Fields**:
- `positionState: PermanentPositionState` - Current 3D position state
- `abilities: BurrowAbility` - Reference to burrow/submerge capabilities

### Site (Extended)
Adds edge-based positioning to existing site entities.

**New Fields**:
- `positionData: SitePositionData` - Edge-based placement information
- `burrowedPermanents: number[]` - Array of permanent IDs currently underneath

**Validation Rules**:
- `burrowedPermanents` array should only contain permanents with burrowed/submerged state
- Maximum 5 permanents can be burrowed under a single site

## State Management Schema (Zustand Store Extensions)

### PermanentPositionSlice
New slice to be added to existing game store.

```typescript
interface PermanentPositionSlice {
  permanentPositions: Map<number, PermanentPositionState>;
  setPermanentPosition: (permanentId: number, state: PermanentPositionState) => void;
  getPermanentPosition: (permanentId: number) => PermanentPositionState | null;
  getBurrowedAtSite: (siteId: number) => number[];
  canUseBurrowAbility: (permanentId: number) => boolean;
  canUseSubmergeAbility: (permanentId: number) => boolean;
}
```

### SitePlacementSlice
New slice for managing site edge placement.

```typescript
interface SitePlacementSlice {
  sitePositions: Map<number, SitePositionData>;
  calculateSiteEdgePosition: (tileX: number, tileZ: number, playerId: number) => {x: number, z: number};
  setSitePosition: (siteId: number, positionData: SitePositionData) => void;
  getSitePosition: (siteId: number) => SitePositionData | null;
}
```

## Data Flow Architecture

### Position State Updates
```
User Right-Click → ContextMenu → Action Selection → Store Update → 3D Component Re-render → Animation
```

### Site Placement Flow
```  
Site Placement Request → Player Position Lookup → Edge Calculation → Store Update → Board Re-render
```

### Ability Validation Flow
```
Context Menu Open → Permanent Ability Check → Dynamic Action Generation → Menu Render
```

## Performance Considerations

**Memory Usage**:
- PermanentPositionState: ~32 bytes per permanent
- SitePositionData: ~64 bytes per site  
- BurrowAbility: ~48 bytes per capable permanent
- Total estimated overhead: <5KB for typical game session

**Update Frequency**:
- Position state changes: User-initiated only (~1-5 per minute)
- Site placement: Game setup only (~10-20 per game)
- Ability checks: Context menu opens only (~10-20 per minute)

**Optimization Strategies**:
- Use Map structures for O(1) lookups
- Batch position updates to avoid frequent re-renders
- Cache ability calculations in component state