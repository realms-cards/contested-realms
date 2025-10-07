# End-to-End Test Plan for Player Flows

## Overview
This test plan covers critical player flows to ensure no regressions in game startup, state management, and recovery logic.

## Test Scope

### 1. Draft Flow (Online Multiplayer)
**Critical Path**:
- Join match → D20 Roll → Seat Selection → Pack Selection → Pick/Pass → Deck Building → Game Start → Mulligan → Play

**Test Cases**:
1. **D20 Roll & Seat Selection**
   - Both players roll D20
   - Winner selects seat
   - Setup screen waits for seat selection before closing
   - Server phase transitions correctly to "Start"

2. **Draft Phase Transitions**
   - waiting → pack_selection → picking → passing → complete
   - Pack passing direction (L-R-L for 3 packs)
   - Pick tracking (15 picks per pack)
   - Auto-pass when both players pick from same pack

3. **Reconnection During Draft**
   - Player disconnects mid-draft
   - State recovers from server on reconnect
   - Current pack and picks are restored
   - Draft continues seamlessly

4. **Draft to Game Transition**
   - Draft completes successfully
   - Navigate to deck editor
   - Deck is constructed
   - Return to match for game start
   - No reconnection loops

5. **Game State Recovery**
   - Page reload during game
   - State recovers from server
   - D20 results persist
   - Seat assignments persist
   - Game continues from current phase

### 2. Sealed Flow
**Critical Path**:
- Join match → Open Packs → Deck Building → Game Start → D20 Roll → Mulligan → Play

**Test Cases**:
1. **Pack Opening**
   - Sealed packs generated
   - 6 packs per player (or configured amount)
   - All cards available for deck building

2. **Deck Construction**
   - Minimum 40 cards
   - Deck validation before match start
   - Navigate back to match

3. **Game Start Sequence**
   - D20 roll after both players ready
   - Seat selection by winner
   - Mulligan phase
   - Game begins

4. **State Recovery**
   - Reload during sealed deck building
   - Packs persist
   - Built deck persists
   - Return to match without losing progress

### 3. Constructed Flow
**Critical Path**:
- Join match → Select Deck → Ready → D20 Roll → Seat Selection → Mulligan → Play

**Test Cases**:
1. **Deck Selection**
   - Load player's saved decks
   - Select deck for match
   - Deck validation (legal cards, proper count)

2. **Game Start**
   - Both players ready
   - D20 roll sequence
   - Seat selection
   - Mulligan (keep/mulligan decision)

3. **Mulligan Logic**
   - Draw 7 cards
   - Player can mulligan (draw 6, then 5, etc.)
   - Game starts after both players keep

4. **State Recovery**
   - Reload during mulligan
   - Hand persists
   - Mulligan count persists
   - Continue from current phase

### 4. Tournament Flow
**Critical Path**:
- Create Tournament → Register → Draft/Sealed Phase → Matches → Pairings → Results

**Test Cases**:
1. **Tournament Creation**
   - Set format (Swiss, Constructed, Sealed, Draft)
   - Configure rounds
   - Configure pack settings (or cube for draft)
   - Publish tournament

2. **Registration Phase**
   - Players register
   - Tournament starts when full or manually started
   - Transition to draft/sealed phase

3. **Draft Tournament**
   - Tournament starts draft session
   - All players draft simultaneously
   - Draft completes
   - Matches created based on pairings

4. **Match Pairings**
   - Swiss pairings generated
   - Players matched based on standings
   - Bye handling for odd player count

5. **Match Results**
   - Match completes
   - Results recorded
   - Standings updated
   - Next round pairings

6. **Tournament Completion**
   - All rounds complete
   - Final standings
   - Winner declared

### 5. Cube Draft (New Feature)
**Critical Path**:
- Join Cube Draft → Pack Selection → Pick/Pass → Deck Building → Game

**Test Cases**:
1. **Cube Booster Generation**
   - Cube cards loaded from database
   - Boosters generated with proper card counts
   - No duplicate cards across packs (proper sampling)

2. **Draft Flow**
   - Same as regular draft
   - All cube cards available

3. **Tournament Cube Draft**
   - Tournament with cube configured
   - All players draft from same cube
   - Packs generated correctly
   - Matches proceed normally

## Testing Strategy

### Unit Tests
- State management logic (Zustand stores)
- Draft sync manager
- Pairing algorithms
- Validation functions

### Integration Tests
- WebSocket event flows
- State transitions
- Phase management
- Recovery logic

### E2E Simulation Tests
- Mock socket connections
- Simulate full player flows
- Test state recovery scenarios
- Verify no regressions

## Success Criteria
- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ No console errors during flows
- ✅ State recovery works correctly
- ✅ No reconnection loops
- ✅ Phase transitions are clean
- ✅ D20 seat selection doesn't skip

## Notes
- Tests should be deterministic (use seeded RNG)
- Mock database calls where appropriate
- Use vitest for test framework
- Focus on critical paths that users experience
