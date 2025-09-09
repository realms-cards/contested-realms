# Research: Card Preview Implementation Analysis

**Date**: 2025-09-09  
**Focus**: Understanding differences between working draft-3d and broken editor-3d card preview functionality

## Issue Analysis

The card preview functionality in editor-3d is not fully broken but implemented inconsistently compared to the working draft-3d implementation:

### Primary Issues
1. **Missing Specialized Hand Component**: draft-3d uses `DraftPackHand3D` with comprehensive hover handling, while editor-3d lacks equivalent specialized hover management
2. **Disabled Raycasting**: `DraggableCard3D` in editor-3d disables raycast with `raycast={() => []}`, preventing `MouseTracker` from detecting cards
3. **Inconsistent Hover Management**: draft-3d has sophisticated debounced hover timers and stable detection, while editor-3d has simpler, less robust handling
4. **Mouse Tracking Coordination**: draft-3d coordinates between `MouseTracker` and individual card hover events, while editor-3d relies primarily on `MouseTracker`

## Key Implementation Differences

### Draft-3d (Working Implementation)
```typescript
// Comprehensive hover management with timers
const showCardPreview = useCallback((card) => {
  if (clearHoverTimerRef.current) {
    window.clearTimeout(clearHoverTimerRef.current);
    clearHoverTimerRef.current = null;
  }
  currentHoverCardRef.current = card.slug;
  setHoverPreview(card);
}, []);

const hideCardPreview = useCallback(() => {
  if (clearHoverTimerRef.current) {
    window.clearTimeout(clearHoverTimerRef.current);
  }
  clearHoverTimerRef.current = window.setTimeout(() => {
    currentHoverCardRef.current = null;
    setHoverPreview(null);
    clearHoverTimerRef.current = null;
  }, 400);
}, []);

// MouseTracker for board cards + DraftPackHand3D for hand cards
<MouseTracker 
  cards={pick3D} 
  onHover={(card) => card ? showCardPreview({...}) : hideCardPreview()} 
/>
<DraftPackHand3D
  onHoverInfo={(info) => info ? showCardPreview(info) : hideCardPreview()}
  // Additional sophisticated hover management
/>
```

### Editor-3d (Problematic Implementation)
```typescript
// DraggableCard3D disables raycasting - ROOT CAUSE
<mesh
  ref={hitboxRef}
  position={[x, y || 0.002, z]}
  raycast={() => []} // ❌ PREVENTS MOUSE DETECTION
>

// MouseTracker only, no specialized card hover management
<MouseTracker 
  cards={sortedPicks} 
  onHover={(card) => {
    if (card) setHoverPreview({ slug: card.slug, name: card.name, type: card.type });
    else setHoverPreview(null);
  }} 
/>
```

## Root Cause Analysis

**Primary Technical Issue**: In `DraggableCard3D.tsx` line 137:
```typescript
raycast={() => []}
```

This completely disables raycasting for card hitboxes, causing:
- `MouseTracker` cannot detect cards during raycasting
- Only small portions of cards (visual `CardPlane` mesh) remain detectable
- Inconsistent hover behavior across card surface
- Preview system breakdown due to missing interaction surface

**Secondary Issues**:
- Hitbox mesh lacks `userData.cardId` and `userData.slug` that `MouseTracker` expects
- Missing debounced hover timers for stable preview management
- No coordination between individual card hovers and global mouse tracking

## Technical Decisions

### Decision: Enable Raycasting for DraggableCard3D
**Rationale**: The disabled raycasting is the primary blocker for hover detection
**Implementation**: Remove `raycast={() => []}` and add proper userData to hitbox mesh
**Alternative considered**: Creating new hover system without raycasting - rejected due to complexity

### Decision: Implement Draft-3d Hover Pattern
**Rationale**: Draft-3d has proven stable hover management with proper timing
**Implementation**: Copy `showCardPreview`/`hideCardPreview` pattern with debounced timers
**Alternative considered**: Simpler immediate hover - rejected due to UI instability

### Decision: Coordinate MouseTracker with Individual Hovers
**Rationale**: Both systems needed for comprehensive coverage of different card states
**Implementation**: Ensure both systems work together without conflicts
**Alternative considered**: Single hover system - rejected due to different card interaction needs

## Implementation Strategy

### Phase 1: Core Fix (Immediate)
1. **Enable Raycasting**: Remove `raycast={() => []}` from `DraggableCard3D`
2. **Add Card Metadata**: Set `userData: { cardId, slug, type }` on hitbox mesh
3. **Basic Hover**: Ensure `MouseTracker` can detect all cards

### Phase 2: Enhanced Stability
1. **Implement Debounced Timers**: Add `showCardPreview`/`hideCardPreview` functions
2. **Stable Hover Management**: Copy timer-based cleanup from draft-3d
3. **Coordinate Systems**: Ensure MouseTracker and individual card hovers work together

### Phase 3: Testing & Validation
1. **Coverage Testing**: Verify entire card surface triggers preview
2. **Timing Testing**: Ensure stable hover behavior during quick movements
3. **State Testing**: Test preview behavior across different card states

## Dependencies and Constraints

### Required Components
- `MouseTracker`: Already present, needs raycastable targets
- `CardPreview`: Already present and working
- `DraggableCard3D`: Needs raycasting enabled and metadata added

### Performance Considerations
- Raycasting adds minimal performance overhead
- Debounced timers prevent excessive re-renders
- Existing preview system handles multiple cards efficiently

### Compatibility Requirements
- Must not break existing drag/drop functionality
- Must maintain 60fps performance in 3D scenes
- Must work consistently across different card states (stacked, scattered, etc.)