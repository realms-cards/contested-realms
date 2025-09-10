# Research: Live Video and Audio Integration

**Date**: 2025-01-09  
**Research Phase**: Phase 0 - Current Implementation Analysis

## Research Task 1: Current WebRTC Issues Analysis

### Decision
Implement hybrid approach with enhanced server participant tracking and improved client error recovery.

### Rationale
The existing WebRTC foundation is solid but has specific gaps in server-side peer discovery and client-side error handling. The current implementation works for basic scenarios but fails in edge cases due to:
- Missing server-side participant tracking for proper peer discovery
- Client-side race conditions in ICE candidate exchange
- Silent failure handling that masks real issues

### Alternatives Considered
1. **Complete Rewrite**: Rejected - too disruptive given working foundation
2. **Client-Only Fixes**: Rejected - server signaling gaps prevent full resolution
3. **External WebRTC Service**: Rejected - overkill for current 2-player scope

### Current Issues Found
- **Server**: No WebRTC participant registration, broadcasts to entire match room
- **Client**: Race conditions in transport dependency, silent error swallowing
- **UI**: Permission requests without pre-check, device enumeration timing issues

---

## Research Task 2: Global State Management

### Decision
Use React Context for video overlay state with WebRTC hooks remaining focused on connection management.

### Rationale
The existing `useMatchWebRTC` hook is well-designed for connection management but needs a higher-level orchestration layer for global overlay state. React Context provides:
- Component tree-wide state sharing without prop drilling
- Natural integration with existing React hooks pattern
- Minimal overhead compared to external state libraries

### Alternatives Considered
1. **Zustand**: Rejected - adds dependency for limited benefit over Context
2. **Extend existing hook**: Rejected - violates single responsibility principle
3. **Component prop passing**: Rejected - creates excessive prop drilling

### Recommended Approach
- Create `VideoOverlayContext` for global overlay state
- Keep `useMatchWebRTC` focused on WebRTC connection management
- Use Context to coordinate between overlay UI and connection hooks

---

## Research Task 3: Three.js Video Integration

### Decision
Continue using VideoTexture approach with enhanced stream lifecycle management.

### Rationale
The existing `SeatVideo3D` component using VideoTexture is performant and integrates well with React Three Fiber. Issues are in stream lifecycle management rather than the fundamental approach.

### Alternatives Considered
1. **HTML video overlays**: Rejected - breaks 3D scene integration
2. **Canvas-based rendering**: Rejected - unnecessary complexity
3. **WebGL direct rendering**: Rejected - duplicates Three.js functionality

### Performance Considerations
- VideoTexture updates are GPU-accelerated
- Multiple streams manageable within 60fps target
- Audio handled separately via HTML5 audio elements

---

## Research Task 4: Device Management Patterns

### Decision
Implement permission-first device management with graceful fallback handling.

### Rationale
Current device management requests permissions during stream creation, causing UX friction. Permission-first approach allows:
- Better user experience with clear permission status
- Device enumeration after permission grant for accurate labels
- Graceful fallback when permissions denied

### Alternatives Considered
1. **Permission-on-demand**: Rejected - current approach causing UX issues
2. **Persistent device caching**: Rejected - security implications
3. **Default device only**: Rejected - limits user control

### Implementation Strategy
- Check permissions before showing device options
- Refresh device list after permission grant
- Provide clear permission status in UI

---

## Server-Side Enhancements Required

### WebRTC Participant Tracking
```javascript
const rtcParticipants = new Map(); // matchId -> Set<playerId>
```

### Scoped Message Delivery
- `rtc:join` registers participant and notifies existing WebRTC users
- `rtc:signal` delivers only to WebRTC participants in same match
- `rtc:leave` unregisters participant and notifies remaining users

---

## Client-Side Improvements Required

### Error Recovery
- Replace silent error swallowing with proper error state management
- Implement retry logic for common failure scenarios
- Add connection state synchronization with match lifecycle

### Permission Management
- Pre-check permissions before attempting media access
- Show permission status in UI
- Handle permission denial gracefully

### Device Selection
- Refresh device list after permission grant
- Persist device preferences across sessions
- Handle device changes (plug/unplug) during active sessions

---

## Implementation Priorities

1. **High Priority**: Server participant tracking (enables peer discovery)
2. **Medium Priority**: Client error recovery and permission handling  
3. **Low Priority**: Enhanced device management and UI improvements

## Technical Constraints Validated

- **Performance**: VideoTexture approach maintains 60fps target
- **Scale**: Current 2-player limitation acceptable for MVP
- **Browser Support**: WebRTC APIs available in all target browsers
- **Permissions**: Browser permission model requires user gesture for media access

## Next Phase Requirements

Phase 1 should focus on:
- Defining enhanced server event schemas
- Creating client-side contract interfaces for improved hooks
- Specifying error state and recovery patterns
- Designing global overlay context structure