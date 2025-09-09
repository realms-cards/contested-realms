# Quickstart: Online Draft Flow Improvements

**Feature**: Online Draft Flow Improvements  
**Branch**: `005-1-online-draft`  
**Date**: 2025-09-09

## Overview
This quickstart guide demonstrates the improved online draft experience with synchronized pick-and-pass mechanics, persistent deck editing, and proper waiting overlays.

## Prerequisites
- Node.js 18+ installed
- Repository cloned and dependencies installed
- Development server running (`npm run dev`)
- At least 2 browser windows for testing multiplayer

## Test Scenarios

### Scenario 1: Synchronized Pick and Pass

**Objective**: Verify all players must pick before packs rotate

```bash
# Terminal 1: Start dev server
npm run dev

# Open 2+ browser windows
# Navigate each to http://localhost:3000/online/lobby
```

**Steps**:
1. Create a draft session in Browser 1
2. Join the session in Browser 2 
3. Start the draft when both players ready
4. In Browser 1: Pick a card from the pack
5. Observe: Browser 1 shows "Waiting for other players..."
6. In Browser 2: Pick a card from the pack
7. Observe: Both browsers receive new packs simultaneously
8. Verify: Neither player can access new pack until both have picked

**Expected Results**:
- ✅ Pick synchronization enforced
- ✅ Clear waiting indicators
- ✅ Simultaneous pack rotation
- ✅ No race conditions

### Scenario 2: Deck Editor Persistence

**Objective**: Verify drafted cards persist when adding Standard Cards

**Steps**:
1. Complete draft phase (or use test data)
2. Enter deck editor with drafted cards
3. Note the number of drafted cards in deck
4. Click "Add Standard Cards"
5. Select and add 2-3 Standard Cards
6. Verify: Original drafted cards remain in deck
7. Switch between Main Deck and Sideboard tabs
8. Verify: All cards persist correctly

**Expected Results**:
- ✅ Drafted cards never cleared
- ✅ Standard Cards added properly
- ✅ Deck state persists across UI changes
- ✅ Card counts accurate

### Scenario 3: Deck Submission Waiting Overlay

**Objective**: Verify waiting overlay displays during deck submission

**Steps**:
1. Complete deck building in Browser 1
2. Click "Submit Deck"
3. Observe: Waiting overlay appears with:
   - "Waiting for other players..." message
   - Player submission status list
   - Progress indicator (1/2 players submitted)
4. In Browser 2: Submit deck
5. Observe: Both browsers dismiss overlay
6. Verify: Transition to next phase occurs

**Expected Results**:
- ✅ Overlay appears immediately on submission
- ✅ Real-time status updates
- ✅ Clear progress indicators
- ✅ Synchronized dismissal

### Scenario 4: Player Disconnection Handling

**Objective**: Verify graceful handling of disconnections

**Steps**:
1. Start draft with 2+ players
2. During pick phase: Close Browser 2
3. Observe in Browser 1: "Player 2 disconnected" indicator
4. Wait 30 seconds
5. Observe: Bot takes over for disconnected player
6. Reopen Browser 2 and navigate to session
7. Verify: Player can reconnect and continue

**Expected Results**:
- ✅ 30-second grace period works
- ✅ Clear disconnection status
- ✅ Bot takeover after timeout
- ✅ Successful reconnection

### Scenario 5: Multi-Player Scalability

**Objective**: Verify system handles 4+ players

**Steps**:
1. Open 4 browser windows
2. Create and join same draft session
3. Start draft with all 4 players
4. Have players pick at different speeds
5. Verify: Synchronization maintained
6. Monitor: Performance remains smooth
7. Complete full draft cycle

**Expected Results**:
- ✅ All players stay synchronized
- ✅ No performance degradation
- ✅ UI remains responsive
- ✅ State consistency maintained

## Performance Validation

### Metrics to Monitor
```javascript
// Browser Console: Performance check
console.time('pick-sync');
// Make a pick
console.timeEnd('pick-sync'); // Should be < 100ms

// Check frame rate
const fps = performance.getEntriesByType('measure')
  .filter(e => e.name.includes('frame'));
console.log('Average FPS:', fps); // Should be >= 60
```

### Network Validation
```javascript
// Browser DevTools > Network Tab
// Filter by WS (WebSocket)
// Verify:
// - Pick events < 5KB
// - Sync events < 10KB
// - Batch interval ~100ms
```

## Troubleshooting

### Issue: Packs not rotating
**Solution**: Check all players have picked
```javascript
// Browser Console
localStorage.getItem('draft-session');
// Verify hasPickedThisRound: true for all players
```

### Issue: Deck cleared unexpectedly
**Solution**: Check sessionStorage persistence
```javascript
// Browser Console
sessionStorage.getItem('draft-deck');
// Should contain drafted cards array
```

### Issue: Waiting overlay stuck
**Solution**: Check submission status
```javascript
// Browser Console
window.__DRAFT_STATE__.submissions;
// Verify all players show status: 'submitted'
```

## Automated Test Suite

Run integration tests:
```bash
# Run draft synchronization tests
npm test -- --testPathPattern=draft-sync

# Run deck persistence tests
npm test -- --testPathPattern=deck-persistence

# Run waiting overlay tests
npm test -- --testPathPattern=waiting-overlay

# Run all draft tests
npm test -- --testPathPattern=draft
```

## Manual Test Checklist

- [ ] Pick synchronization works with 2 players
- [ ] Pick synchronization works with 4+ players
- [ ] Deck persists when adding Standard Cards
- [ ] Deck persists across route changes
- [ ] Waiting overlay shows on submission
- [ ] Waiting overlay updates in real-time
- [ ] Disconnection grace period works
- [ ] Reconnection preserves state
- [ ] Bot takeover after timeout
- [ ] Performance metrics within targets
- [ ] No memory leaks after extended session
- [ ] Accessibility: Keyboard navigation works
- [ ] Accessibility: Screen reader announces state

## Success Criteria

All test scenarios must pass with:
- Pick synchronization < 100ms
- UI updates at 60fps
- Zero data loss on disconnection
- Successful scaling to 8 players
- No TypeScript errors
- ESLint validation passes

## Next Steps

After validation:
1. Run `npm run lint` to ensure code quality
2. Run `npm run build` to verify production build
3. Create PR with test results documented
4. Deploy to staging for UAT

## Support

For issues or questions:
- Check `/specs/005-1-online-draft/` for detailed documentation
- Review `/tests/integration/` for test examples
- Consult Socket.io logs for synchronization issues