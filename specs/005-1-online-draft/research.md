# Research: Online Draft Flow Improvements

**Date**: 2025-09-09  
**Feature**: Online Draft Flow Improvements  
**Branch**: `005-1-online-draft`

## Executive Summary
Research conducted to resolve NEEDS CLARIFICATION items from the feature specification and establish best practices for implementing synchronized draft mechanics, deck persistence, and waiting overlays in a multiplayer environment.

## Research Findings

### 1. Player Disconnection Handling

**Decision**: Implement 30-second grace period with automatic reconnection
**Rationale**: 
- Balances fairness to other players with network instability tolerance
- 30 seconds covers most temporary disconnections (wifi drops, page refreshes)
- Prevents draft from stalling indefinitely

**Alternatives Considered**:
- Immediate bot takeover: Too harsh for minor network hiccups
- Infinite wait: Unfair to other players, poor UX
- 5-minute timeout: Too long, disrupts draft flow

**Implementation Strategy**:
- Maintain player state server-side during grace period
- Auto-reconnect using session ID
- Show "Player reconnecting..." status to others
- After timeout: Bot takes over picks using simple algorithm

### 2. Timeout Duration for Slow Players

**Decision**: 60-second pick timer with escalating warnings
**Rationale**:
- 60 seconds sufficient for thoughtful picks
- Warnings at 30s, 15s, 5s create urgency without surprise
- Matches typical draft timer conventions

**Alternatives Considered**:
- 30-second timer: Too rushed for complex decisions
- 90-second timer: Slows overall draft pace
- No timer: Can stall indefinitely

**Implementation Strategy**:
- Visual countdown timer in UI
- Audio alerts at warning thresholds
- Auto-pick random card at 0 seconds
- Server authoritative timing

### 3. Maximum Player Count Scalability

**Decision**: 8 players optimal, 16 players maximum
**Rationale**:
- 8 players = standard draft pod size
- Socket.io handles 8 concurrent connections easily
- 16 players possible but requires batching/optimization

**Alternatives Considered**:
- 4 player limit: Too restrictive
- Unlimited: Performance degradation, complex UI
- 32 players: Exponential complexity increase

**Scalability Considerations**:
- Room-based isolation per draft session
- Batch state updates (100ms intervals)
- Compress large payloads
- CDN for card images

## Technical Best Practices

### Socket.io Synchronization Patterns

**Room-based Architecture**:
```typescript
// Each draft session gets unique room
io.to(`draft-${sessionId}`).emit('state:sync', state);

// Player-specific events
socket.to(playerId).emit('your:turn', packData);
```

**Event Batching**:
- Collect multiple updates within 100ms window
- Send as single payload to reduce overhead
- Critical events (picks) sent immediately

### React State Persistence

**Zustand Store Pattern**:
```typescript
interface DraftStore {
  draftedCards: Card[];
  currentPack: Card[];
  // Persist across route changes
  persist: {
    name: 'draft-session',
    storage: sessionStorage,
  }
}
```

**Key Decisions**:
- SessionStorage over localStorage (temporary draft data)
- Zustand over Context API (better performance)
- Separate stores for draft vs deck editor

### Waiting Overlay Patterns

**Progressive Disclosure**:
1. Initial: "Waiting for other players..."
2. After 5s: Show player list with status indicators
3. After 15s: Show who hasn't submitted yet
4. After 30s: Option to continue without waiting

**Visual Hierarchy**:
- Full-screen overlay with semi-transparent backdrop
- Central card with progress information
- Cancel/leave option always visible
- Smooth transitions between states

## Performance Optimization Strategies

### Network Optimization
- **Delta Updates**: Send only changed data, not full state
- **Compression**: gzip for payloads > 1KB
- **Debouncing**: Hover events at 100ms intervals
- **Caching**: Card data in IndexedDB

### UI Optimization
- **Virtual Scrolling**: For large card lists
- **Lazy Loading**: Load card images on demand
- **Memoization**: React.memo for card components
- **Web Workers**: Offload sorting/filtering logic

## Security Considerations

### Anti-Cheat Measures
- **Server Authoritative**: All picks validated server-side
- **Timestamp Verification**: Prevent time manipulation
- **Rate Limiting**: Max 1 pick per second
- **Session Validation**: Verify player belongs to draft

### Data Integrity
- **Checksums**: Verify pack contents unchanged
- **Audit Trail**: Log all picks with timestamps
- **Replay System**: Can reconstruct draft from logs

## Accessibility Requirements

### WCAG 2.1 Compliance
- **Keyboard Navigation**: All actions keyboard accessible
- **Screen Reader**: ARIA labels for all interactive elements
- **Color Contrast**: 4.5:1 minimum ratio
- **Focus Indicators**: Clear visual focus states

### User Preferences
- **Reduced Motion**: Respect prefers-reduced-motion
- **Color Blind Mode**: Alternative color schemes
- **Font Scaling**: Support up to 200% zoom

## Testing Strategy

### Integration Test Scenarios
1. **Happy Path**: 8 players complete draft successfully
2. **Disconnection**: Player disconnects and reconnects
3. **Timeout**: Player times out, bot takes over
4. **Concurrent Picks**: All players pick simultaneously
5. **Network Issues**: Packet loss, high latency

### Performance Benchmarks
- Pick synchronization: < 100ms p95
- UI updates: 60fps minimum
- Memory usage: < 200MB per session
- Network usage: < 50KB per pick

## Implementation Priorities

### Phase 1: Core Synchronization
- Socket event handlers
- State management
- Basic pick/pass flow

### Phase 2: Persistence & Recovery
- Deck editor integration
- Reconnection logic
- State persistence

### Phase 3: Waiting Overlay
- UI components
- Progress indicators
- Timeout handling

### Phase 4: Optimizations
- Performance tuning
- Scalability improvements
- Advanced features

## Conclusion

All NEEDS CLARIFICATION items have been resolved with data-driven decisions. The implementation approach prioritizes:
1. **Reliability**: Graceful handling of network issues
2. **Performance**: Sub-100ms synchronization
3. **Scalability**: Support for 8+ players
4. **User Experience**: Clear feedback and smooth interactions

The research supports a phased implementation with strong typing, modular architecture, and comprehensive testing as specified in user requirements.