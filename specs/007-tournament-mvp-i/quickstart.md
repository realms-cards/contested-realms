# Tournament MVP - Quickstart Guide

**Purpose**: End-to-end validation scenarios for tournament functionality  
**Prerequisites**: Development environment with SQLite database and Socket.io server  
**Test Duration**: ~15 minutes per scenario

## Scenario 1: Sealed Tournament Flow

### Setup
```bash
# Ensure feature flag is enabled
npm run dev
# Navigate to http://localhost:3000/tournaments
```

### Test Steps

#### 1. Tournament Creation (FR-002, FR-003)
1. **Login** as tournament organizer user
2. **Navigate** to tournaments page
3. **Click** "Create Tournament" button
4. **Fill form**:
   - Name: "Test Sealed Tournament"
   - Format: "Sealed" 
   - Max Players: 8
   - Pack Configuration: 6 packs of "Beta" set
   - Deck Building Time: 30 minutes
5. **Submit** form
6. **Verify**: Tournament appears in list with status "Registering"

**Expected Result**: ✅ Tournament created successfully with sealed format configuration

#### 2. Player Registration (FR-004)
1. **Login** as different players (minimum 4 for testing)
2. **Navigate** to tournament details page
3. **Click** "Join Tournament" button
4. **Verify**: Player appears in participants list
5. **Repeat** for additional players
6. **Verify**: Current players count updates

**Expected Result**: ✅ Players can join tournament, participant count accurate

#### 3. Preparation Phase Start (FR-005)
1. **As organizer**, click "Start Preparation Phase"
2. **Verify**: Tournament status changes to "Preparing"
3. **Verify**: All participants receive Socket.io notification
4. **Verify**: Preparation UI appears for all players

**Expected Result**: ✅ Preparation phase starts, all players notified

#### 4. Pack Opening (FR-006)
1. **As registered player**, view preparation screen
2. **Click** "Open Packs" button
3. **Verify**: 6 packs worth of cards appear
4. **Build deck** using opened cards (40-card minimum)
5. **Submit** deck
6. **Verify**: Preparation status updates to "Completed"

**Expected Result**: ✅ Players can open sealed packs and build decks

#### 5. Match Phase Start (FR-014)
1. **Wait** for all players to complete preparation
2. **Verify**: Tournament automatically starts match phase
3. **Verify**: Status changes to "Active"
4. **Verify**: First round pairings generated

**Expected Result**: ✅ Tournament automatically progresses to matches

#### 6. Statistics Viewing (FR-011, FR-012)
1. **As any participant**, view tournament statistics
2. **Verify**: Current standings displayed
3. **Verify**: Match results updated in real-time
4. **Verify**: Tournament overlay shows live data

**Expected Result**: ✅ Statistics overlay shows accurate tournament data

## Scenario 2: Draft Tournament Flow

### Test Steps

#### 1. Draft Tournament Creation
1. **Create tournament** with format "Draft"
2. **Configure**: 3 packs per player, 90 seconds per pick
3. **Register** 8 players
4. **Start preparation phase**

#### 2. Multiplayer Draft (FR-007)
1. **As registered player**, enter draft session
2. **Verify**: All 8 players in same draft pod
3. **Make picks** within time limit
4. **Verify**: Packs rotate correctly
5. **Complete** 3 rounds of drafting
6. **Build deck** from drafted cards

**Expected Result**: ✅ Enhanced multiplayer draft works correctly

## Scenario 3: Constructed Tournament Flow

### Test Steps

#### 1. Constructed Tournament Creation
1. **Create tournament** with format "Constructed"
2. **Configure**: Standard format rules
3. **Register** players

#### 2. Deck Selection (FR-008)
1. **As registered player**, view preparation screen
2. **Select deck** from existing collection
3. **Verify**: Deck validates against format rules
4. **Submit** deck selection

**Expected Result**: ✅ Players can select and validate constructed decks

## Scenario 4: Feature Flag Testing (FR-001)

### Test Steps

#### 1. Feature Disabled
1. **Disable** tournament feature flag in config
2. **Navigate** to application
3. **Verify**: Tournament UI elements hidden
4. **Verify**: Tournament API endpoints return 403

#### 2. Feature Enabled
1. **Enable** tournament feature flag
2. **Refresh** application
3. **Verify**: Tournament UI elements visible
4. **Verify**: Tournament functionality accessible

**Expected Result**: ✅ Feature flag correctly controls tournament access

## Scenario 5: Error Handling

### Test Steps

#### 1. Tournament Capacity
1. **Create** tournament with 8 max players
2. **Register** 8 players successfully
3. **Attempt** to register 9th player
4. **Verify**: Error message displayed
5. **Verify**: Registration prevented

#### 2. Phase Transition Errors
1. **Start preparation** with insufficient players
2. **Verify**: Appropriate error shown
3. **Try** to start matches before preparation complete
4. **Verify**: Prevented with clear message

#### 3. Network Disconnection
1. **Start tournament** participation
2. **Simulate** network disconnect
3. **Verify**: Graceful error handling
4. **Reconnect** and verify state recovery

**Expected Result**: ✅ Robust error handling throughout tournament flow

## Performance Validation

### Test Metrics
- **Tournament creation**: < 500ms response time
- **Player registration**: < 200ms response time  
- **Statistics updates**: < 100ms real-time latency
- **UI rendering**: Maintains 60fps during overlay animations
- **Memory usage**: < 100MB additional for tournament features

### Load Testing
1. **Create** multiple concurrent tournaments
2. **Register** maximum players per tournament
3. **Monitor** performance metrics
4. **Verify**: System maintains responsiveness

**Expected Result**: ✅ Performance targets met under load

## Integration Validation

### Socket.io Events
- Tournament phase transitions broadcast correctly
- Real-time statistics updates received by all participants
- Draft session coordination works across multiple players

### Database Integrity
- Tournament data persists correctly
- Statistics calculations accurate
- Foreign key relationships maintained

### UI/UX Validation
- Tournament overlay displays beautifully
- Responsive design works on mobile devices
- Dark/light theme support functional
- Smooth animations and transitions

---

**Quickstart Status**: Ready for test execution  
**Total Scenarios**: 5 core flows + performance + integration  
**Automation Potential**: High (API endpoints easily testable)