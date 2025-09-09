# Quickstart: Card Preview Fix Implementation

**Date**: 2025-09-09  
**Purpose**: Step-by-step guide to implement and test the card preview fix

## Overview

This quickstart provides the exact steps to fix card preview functionality in editor-3d by enabling raycasting and implementing proper hover management patterns from draft-3d.

## Prerequisites

- React Three Fiber knowledge
- TypeScript/React experience
- Understanding of Three.js raycasting
- Editor-3d codebase access

## Quick Fix (5 minutes)

### Step 1: Enable Raycasting in DraggableCard3D

**File**: `src/app/decks/editor-3d/DraggableCard3D.tsx`

**Find** (around line 137):
```typescript
raycast={() => []}
```

**Replace with**:
```typescript
// Remove the raycast prop entirely, or set to undefined
// raycast={undefined}  // Optional - can also just delete the line
```

### Step 2: Add Card Metadata to Hitbox

**In the same file**, find the hitbox mesh and **add userData**:

```typescript
<mesh
  ref={hitboxRef}
  position={[x, y || 0.002, z]}
  // raycast={() => []} // ❌ REMOVE THIS LINE
  userData={{
    cardId: cardId || 0,
    slug: slug,
    type: null, // Will be enhanced in full implementation
  }}
>
```

### Step 3: Test Basic Hover

1. Start the development server: `npm run dev`
2. Navigate to `/decks/editor-3d`
3. Add some cards to the deck
4. Hover over cards - previews should now appear

## Full Implementation (30 minutes)

### Step 4: Add Hover State Management

**File**: `src/app/decks/editor-3d/page.tsx`

Add the hover management functions from draft-3d:

```typescript
// Add near other state declarations
const clearHoverTimerRef = useRef<number | null>(null);
const currentHoverCardRef = useRef<string | null>(null);

// Add these callback functions
const showCardPreview = useCallback((card: { slug: string; name: string; type: string | null }) => {
  // Clear any pending hide timer
  if (clearHoverTimerRef.current) {
    window.clearTimeout(clearHoverTimerRef.current);
    clearHoverTimerRef.current = null;
  }
  
  // Show preview immediately and keep it shown while hovering
  currentHoverCardRef.current = card.slug;
  setHoverPreview(card);
}, []);

const hideCardPreview = useCallback(() => {
  // Small delay before hiding to handle quick mouse movements
  if (clearHoverTimerRef.current) {
    window.clearTimeout(clearHoverTimerRef.current);
  }
  
  clearHoverTimerRef.current = window.setTimeout(() => {
    currentHoverCardRef.current = null;
    setHoverPreview(null);
    clearHoverTimerRef.current = null;
  }, 400); // 400ms delay like draft-3d
}, []);

// Add cleanup effect
useEffect(() => {
  return () => {
    if (clearHoverTimerRef.current) {
      window.clearTimeout(clearHoverTimerRef.current);
    }
  };
}, []);
```

### Step 5: Update MouseTracker Usage

**In the same file**, find the MouseTracker component and update:

```typescript
<MouseTracker 
  cards={sortedPicks} 
  onHover={(card) => {
    if (card) {
      showCardPreview({
        slug: card.slug,
        name: card.name,
        type: card.type,
      });
    } else {
      hideCardPreview();
    }
  }} 
/>
```

### Step 6: Enhanced DraggableCard3D Props

**File**: `src/app/decks/editor-3d/DraggableCard3D.tsx`

Add hover callback props:

```typescript
export interface DraggableCard3DProps {
  // ... existing props
  cardId?: number;
  onHoverStart?: (card: { slug: string; name: string; type: string | null }) => void;
  onHoverEnd?: () => void;
}

// In the component, add hover handlers to the hitbox mesh:
<mesh
  ref={hitboxRef}
  position={[x, y || 0.002, z]}
  userData={{ cardId: cardId || 0, slug, type: null }}
  onPointerEnter={() => {
    if (onHoverStart) {
      onHoverStart({ slug, name: slug, type: null }); // Enhance with real name/type
    }
  }}
  onPointerLeave={() => {
    if (onHoverEnd) {
      onHoverEnd();
    }
  }}
>
```

## Testing Checklist

### Manual Testing
- [ ] Navigate to `/decks/editor-3d`
- [ ] Add cards to deck (drag from search results)
- [ ] Hover over cards on the 3D board
- [ ] Verify preview appears immediately
- [ ] Move mouse quickly between cards
- [ ] Verify preview updates smoothly without flickering
- [ ] Move mouse away from cards
- [ ] Verify preview disappears after ~400ms

### Edge Case Testing
- [ ] Hover over stacked cards (all cards should be hoverable)
- [ ] Hover during drag operations
- [ ] Hover on different card types (creatures, sites, spells)
- [ ] Test with many cards (>50) for performance
- [ ] Test keyboard navigation if implemented

### Performance Testing
- [ ] Check browser dev tools for memory leaks
- [ ] Monitor FPS during hover interactions
- [ ] Verify no console errors
- [ ] Test on slower devices/browsers

## Troubleshooting

### Preview Still Not Appearing
1. Check browser console for errors
2. Verify `raycast={() => []}` is completely removed
3. Check that `userData` is set on the mesh
4. Verify `MouseTracker` is receiving hover events

### Preview Flickering
1. Check hover timer delays (should be 400ms)
2. Verify timer cleanup in useEffect
3. Check for multiple hover systems conflicting

### Performance Issues
1. Verify only one preview is shown at a time
2. Check for timer leaks (use React DevTools Profiler)
3. Optimize raycasting if needed (limit to visible cards)

## Success Criteria

✅ **Fixed**: Card previews appear when hovering over any part of a card  
✅ **Stable**: No flickering during quick mouse movements  
✅ **Consistent**: Behavior matches draft-3d preview timing  
✅ **Performance**: No significant FPS drops with many cards  
✅ **Clean**: No console errors or memory leaks  

## Next Steps

After basic fix is working:
1. Add comprehensive tests (see `contracts/behavior-tests.ts`)
2. Implement enhanced card metadata display
3. Add keyboard navigation support
4. Consider accessibility improvements

## Rollback Plan

If issues arise, revert by:
1. Re-add `raycast={() => []}` to `DraggableCard3D.tsx`
2. Remove `userData` from hitbox mesh  
3. Revert MouseTracker changes
4. Remove hover management functions

This returns to the original (broken) state while maintaining other functionality.