# Data Model: Card Preview System

**Date**: 2025-09-09  
**Purpose**: Define data structures and relationships for card preview functionality

## Core Entities

### CardPreviewData
Represents the essential data needed to display a card preview overlay.

**Fields**:
- `slug: string` - Unique identifier for card image/asset lookup
- `name: string` - Display name for the card
- `type: string | null` - Card type (e.g., "Creature", "Site", "Spell")

**Usage**: Passed to `CardPreview` component for rendering hover overlays

**Validation Rules**:
- `slug` must be non-empty string
- `name` must be non-empty string
- `type` can be null for unknown/untyped cards

### CardHoverState
Manages the hover interaction state and timing for stable preview behavior.

**Fields**:
- `currentCard: string | null` - Slug of currently hovered card
- `previewVisible: boolean` - Whether preview overlay should be shown
- `clearTimer: number | null` - Timeout ID for debounced hide behavior
- `lastHoverCard: CardPreviewData | null` - Last card data shown in preview

**State Transitions**:
- `null` → `hovering` (mouse enters card)
- `hovering` → `previewing` (debounce timer completes)
- `previewing` → `hiding` (mouse leaves card)
- `hiding` → `null` (hide timer completes)
- `hiding` → `hovering` (mouse re-enters before hide completes)

### MouseTrackingData
Data structure used by `MouseTracker` component for raycast-based hover detection.

**Fields**:
- `cardId: number` - Database ID of the card
- `slug: string` - Asset identifier for the card
- `type: string | null` - Card type information
- `name?: string` - Optional display name

**Usage**: Set as `userData` on Three.js mesh objects for raycast detection

### DraggableCardProps
Enhanced props for `DraggableCard3D` component to support hover functionality.

**Required Fields**:
- `slug: string` - Card asset identifier
- `x: number, z: number` - Position coordinates
- `onHoverChange?: (isHovered: boolean) => void` - Hover state callback

**Optional Fields**:
- `cardId?: number` - Database reference for metadata
- `onHoverStart?: (card: CardPreviewData) => void` - Preview trigger callback
- `onHoverEnd?: () => void` - Preview hide callback

## Data Relationships

```
CardPreviewData (1) ←→ (1) CardHoverState
    ↓ displays via
CardPreview Component
    ↑ triggered by
MouseTrackingData → raycast → hover detection
    ↑ set by
DraggableCard3D.userData
```

## Validation and Constraints

### CardPreviewData Constraints
- Must contain valid slug for asset lookup
- Name should be human-readable display text
- Type can be null but should be populated when available

### Hover Timing Constraints
- Show delay: 0ms (immediate)
- Hide delay: 400ms (debounced to prevent flicker)
- Timer cleanup required on component unmount

### Performance Constraints
- Maximum 1 active preview at any time
- Raycast userData must be minimal (< 1KB per card)
- Hover state updates must be batched for performance

## Migration from Current State

### Current Implementation Issues
- `DraggableCard3D` has `raycast={() => []}` preventing detection
- Missing `userData` on hitbox mesh
- No debounced hover state management
- Inconsistent preview behavior

### Required Changes
1. **Enable Raycasting**: Remove disabled raycast function
2. **Add Metadata**: Set `userData: { cardId, slug, type }` on mesh
3. **Implement Hover State**: Add `CardHoverState` management
4. **Coordinate Systems**: Ensure MouseTracker and individual card hovers work together

## Success Criteria
- Every visible part of card triggers preview when hovered
- Hover behavior matches draft-3d stability and timing
- No performance degradation in 3D scenes with many cards
- Consistent preview behavior across different card states