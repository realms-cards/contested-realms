# Research: Burrow/Submerge Mechanics Implementation

**Feature**: Permanent Burrow/Submerge Mechanics  
**Date**: 2025-01-09

## Three.js Y-axis Positioning for Layered Object Placement

**Decision**: Use Y-axis negative positioning (-0.1 to -0.5) for "under site" visual effect

**Rationale**: 
- Y-axis represents vertical depth in the existing 3D game coordinate system
- Negative Y values place objects below the zero plane where sites are positioned
- Maintains consistent perspective and lighting
- No performance impact compared to separate scene layers
- Allows for smooth transitions with CSS/Three.js animations

**Alternatives considered**:
- Opacity transitions: Would make permanents hard to interact with
- Scale reduction: Could be confused with distance effects
- Separate scene layers: Complex to implement and potential performance issues
- Z-axis positioning: Already used for player positioning and would conflict

## React Three Fiber Object Depth Management

**Decision**: Use `position` prop with Y-axis offsets and transition groups for smooth animations

**Rationale**:
- React Three Fiber's `position` prop directly maps to Three.js Object3D.position
- `react-spring` integration available for smooth transitions
- Can leverage existing `useFrame` hooks for continuous position updates
- Maintains React component lifecycle and state consistency

**Alternatives considered**:
- Manual Three.js object manipulation: Breaks React paradigms
- CSS-based 3D transforms: Limited control over 3D scene integration
- Custom animation libraries: Unnecessary complexity when react-spring exists

## Context Menu Implementation Extensibility

**Decision**: Extend existing `ContextMenu.tsx` with dynamic action system based on permanent abilities

**Rationale**:
- Current implementation at `src/components/game/ContextMenu.tsx` already supports dynamic options
- Uses conditional rendering based on card/permanent state
- Integrates with existing Zustand store for action dispatch
- Consistent UI/UX with current right-click interactions

**Alternatives considered**:
- New dedicated burrow menu: Would fragment user experience
- Tooltip-based actions: Less discoverable and harder to tap on mobile
- Keyboard shortcuts only: Not discoverable and conflicts with existing shortcuts

## Site Placement Logic for Edge-Positioning

**Decision**: Modify Board.tsx site placement to use player-facing edge calculation with trigonometric positioning

**Rationale**:
- Current `Board.tsx` has centralized site placement logic
- Player positions are available in game state for angle calculations
- Edge placement can be calculated using player position vector and tile boundaries
- Maintains consistent tile grid while improving visual organization

**Alternatives considered**:
- Fixed edge positions: Would ignore player positions and reduce strategic visual clarity
- Random edge placement: Could create confusing layouts
- Corner placement only: Limited to 4 positions per tile, could cause overlaps

## Implementation Architecture Summary

**Core Components to Modify**:
1. `src/lib/game/store.ts` - Add permanent position state (burrowed/submerged)
2. `src/lib/game/components/CardPlane.tsx` - Support Y-axis positioning based on state
3. `src/components/game/ContextMenu.tsx` - Add burrow/submerge/surface options
4. `src/lib/game/Board.tsx` - Modify site placement to use edge-based positioning
5. `src/lib/game/types.ts` - Add position state enums and interfaces

**New State Model**:
```typescript
type PermanentPositionState = 'surface' | 'burrowed' | 'submerged';

interface PermanentPosition {
  cardId: number;
  state: PermanentPositionState;
  siteId?: number;
  depth: number; // Y-axis offset for 3D positioning
}
```

**Animation Strategy**:
- Use `react-spring` for smooth Y-axis transitions (200ms duration)
- Maintain interaction hitboxes even when visually "under" sites
- Visual feedback through subtle glow or outline for burrowed permanents

## Performance Considerations

**Acceptable Impact**:
- Additional Y-axis transforms: Negligible GPU cost
- Animation transitions: Limited to <5 concurrent animations typically
- State tracking: Minimal memory overhead per permanent

**Mitigation Strategies**:
- Batch position updates to avoid frequent re-renders
- Use `useMemo` for position calculations
- Limit concurrent animations with queue system if needed

## Validation Criteria

**Technical Success Metrics**:
- 60 fps maintained during position transitions
- <100ms response time for context menu actions
- No Z-fighting or visual artifacts with burrowed permanents
- Consistent behavior across different camera angles/zoom levels

**User Experience Validation**:
- Right-click → burrow → visual feedback within 200ms
- Clear visual distinction between surface/burrowed states
- Intuitive site placement that improves game board readability