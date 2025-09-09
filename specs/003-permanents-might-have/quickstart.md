# Quickstart: Burrow/Submerge Feature Validation

**Feature**: Permanent Burrow/Submerge Mechanics  
**Date**: 2025-01-09  
**Purpose**: End-to-end validation scenarios for user acceptance

## Prerequisites

1. **Test Environment Setup**:
   ```bash
   npm run dev
   npm run test:watch
   ```

2. **Test Data Requirements**:
   - At least 2 permanents with burrow ability
   - At least 1 permanent with submerge ability  
   - At least 1 water-type site
   - At least 2 regular sites on different tiles

3. **Browser Setup**:
   - WebGL-enabled browser
   - 3D acceleration enabled
   - Console open for debugging (F12)

## Validation Scenarios

### Scenario 1: Basic Burrow Functionality
**User Story**: Player burrows a permanent under a site

**Steps**:
1. Navigate to game board with permanent cards on sites
2. Locate a permanent with burrow ability (should have visual indicator)
3. Right-click on the permanent
4. Verify "Burrow" option appears in context menu
5. Click "Burrow" option
6. **Expected Result**: 
   - Permanent smoothly animates downward (Y-axis negative)
   - Permanent becomes visually "under" the site
   - Permanent remains interactable
   - Animation completes within 200ms

**Success Criteria**:
- ✅ Context menu shows "Burrow" option
- ✅ Permanent moves to Y-position between -0.1 and -0.5
- ✅ Animation is smooth and completes in <250ms
- ✅ Permanent maintains correct X,Z position
- ✅ Right-click on burrowed permanent shows "Surface" option

### Scenario 2: Submerge at Water Site
**User Story**: Player submerges a permanent at water site

**Steps**:
1. Place or locate permanent with submerge ability on water-type site
2. Right-click on the permanent
3. Verify "Submerge" option appears (should only show at water sites)
4. Click "Submerge" option
5. **Expected Result**:
   - Permanent animates underwater (below water surface)
   - Visual effect suggests submersion
   - "Emerge" option available on subsequent right-clicks

**Success Criteria**:
- ✅ "Submerge" only available at water sites
- ✅ "Submerge" not available at non-water sites
- ✅ Submerged permanent positioned correctly underwater
- ✅ "Emerge" option restores to surface position

### Scenario 3: Site Edge Placement
**User Story**: Sites appear toward tile edges facing the owning player

**Steps**:
1. Start new game or clear board
2. Place sites as different players
3. Observe site positioning within tiles
4. **Expected Result**:
   - Sites positioned toward edges, not tile centers
   - Sites face toward respective owning player positions
   - Multiple sites on same tile don't overlap

**Success Criteria**:
- ✅ Sites positioned with offset from tile center
- ✅ Offset direction points toward owning player
- ✅ Edge offset magnitude ≤0.4 tile units
- ✅ No site overlap conflicts
- ✅ Visual improvement in board organization

### Scenario 4: Multiple Permanents Under One Site
**User Story**: Multiple permanents can burrow under the same site

**Steps**:
1. Place 2-3 permanents with burrow ability on same site
2. Burrow first permanent → verify position
3. Burrow second permanent → verify both visible
4. Burrow third permanent → verify all three manageable
5. **Expected Result**:
   - All burrowed permanents remain accessible
   - Visual stacking or spacing prevents overlap
   - Context menus work for all burrowed permanents

**Success Criteria**:
- ✅ Up to 5 permanents can burrow under one site
- ✅ Burrowed permanents maintain individual identity
- ✅ Right-click targeting works correctly
- ✅ Performance remains stable (60fps)

### Scenario 5: State Transition Validation
**User Story**: State transitions follow rules (no direct burrow↔submerge)

**Steps**:
1. Burrow a permanent that can also submerge
2. Right-click on burrowed permanent
3. Verify "Submerge" option is NOT available
4. Surface the permanent
5. At water site, verify "Submerge" becomes available
6. **Expected Result**:
   - Direct burrow→submerge blocked
   - Must go through surface state
   - Appropriate actions shown based on current state

**Success Criteria**:
- ✅ No "Submerge" option when burrowed
- ✅ No "Burrow" option when submerged
- ✅ "Surface"/"Emerge" always available for underground permanents
- ✅ State transitions enforce game rules

## Performance Validation

### Frame Rate Test
**Target**: Maintain ≥55fps during transitions

**Steps**:
1. Open browser performance monitor
2. Execute 5 rapid burrow/surface transitions
3. Monitor frame rate during animations
4. **Expected**: No drops below 55fps

### Memory Leak Test
**Target**: No memory growth over extended use

**Steps**:
1. Execute 20 burrow/surface cycles
2. Monitor memory usage in dev tools
3. Force garbage collection
4. **Expected**: Memory returns to baseline

### Responsiveness Test
**Target**: <100ms action response time

**Steps**:
1. Right-click → context menu appears
2. Click action → animation starts
3. Measure time with performance.now()
4. **Expected**: <100ms from click to animation start

## Error Handling Validation

### Invalid State Handling
**Steps**:
1. Manually trigger invalid state transition (via dev tools)
2. **Expected**: Error logged, state remains consistent
3. UI recovers gracefully

### Network Interruption (Multiplayer)
**Steps**:
1. Start burrow action in multiplayer
2. Disconnect network mid-transition
3. **Expected**: Local state preserved, sync on reconnect

## Accessibility Validation

### Keyboard Navigation
**Steps**:
1. Tab to permanent card
2. Press context menu key (application key)
3. Navigate menu with arrow keys
4. **Expected**: Full keyboard functionality

### Screen Reader Support
**Steps**:
1. Enable screen reader
2. Navigate to permanent
3. Open context menu
4. **Expected**: Actions announced clearly

## Browser Compatibility

**Test Browsers**:
- [ ] Chrome 120+ (WebGL 2.0)
- [ ] Firefox 115+ (WebGL 2.0)
- [ ] Safari 16+ (WebGL 2.0)
- [ ] Edge 120+ (WebGL 2.0)

**Validation Per Browser**:
- 3D positioning works correctly
- Animations are smooth
- Context menus function properly
- Performance meets targets

## Acceptance Criteria Summary

**Must Pass ALL**:
- ✅ Burrow/Surface cycle completes successfully
- ✅ Submerge/Emerge at water sites works
- ✅ Site edge placement improves visual organization
- ✅ Multiple permanents under one site supported
- ✅ State transition rules enforced
- ✅ Performance targets met (60fps, <100ms response)
- ✅ No memory leaks or error states
- ✅ Accessibility requirements satisfied
- ✅ Cross-browser compatibility verified

**Ready for Production When**:
- All scenarios pass without manual intervention
- Performance metrics consistently met
- Error handling gracefully manages edge cases
- User testing confirms improved gameplay experience