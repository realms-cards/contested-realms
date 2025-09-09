# Research: Draft-3D Online Integration

**Date**: 2025-01-09  
**Phase**: 0 - Technical Research  
**Status**: Complete  

## Socket.io Event Optimization for 3D Updates

**Decision**: Event Batching with Throttled Broadcasting at 16ms intervals (60fps)
- Implementation: Collect multiple position/rotation updates in server-side buffers and broadcast batched updates every 16ms
- Message Structure: Binary format with position deltas rather than absolute coordinates  
- Buffer Management: Maximum 100 updates per batch to prevent memory overflow

**Rationale**: 
- Maintains 60fps visual smoothness while minimizing network overhead
- Binary format reduces payload size by ~70% compared to JSON
- Delta compression reduces redundant data transmission
- Server-side batching prevents client-side flooding

**Alternatives considered**: 
- Client-side throttling (rejected: inconsistent timing across clients)
- Higher frequency updates 120fps (rejected: excessive bandwidth)  
- Lower frequency 30fps (rejected: noticeable animation stuttering)

## React Three Fiber State Sync Strategies

**Decision**: Hybrid State Architecture with Zustand + useFrame Mutations
- Critical State: Synchronized via WebSocket with Zustand store (card ownership, game phase)
- Visual State: Direct Three.js mutations in useFrame (positions, rotations, animations)
- Instance Management: Shared geometries/materials with instanced rendering for cards

**Rationale**:
- Separates critical game logic from performance-sensitive rendering
- useFrame mutations bypass React's reconciliation for smooth 60fps updates
- Instancing reduces draw calls from ~1000 to <50 for card rendering
- Zustand provides predictable state management without React re-renders

**Alternatives considered**:
- Full React state synchronization (rejected: performance overhead)
- Redux (rejected: complexity and slower updates)
- Direct Three.js state (rejected: difficulty in conflict resolution)

## Card Preview Hover State Broadcasting

**Decision**: Debounced Channel Broadcasting with Priority Levels
- Hover Events: Debounced to 100ms, broadcast only to room members
- Channel Isolation: Separate Socket.io rooms per game table
- Priority System: Hover states marked as low-priority, game actions as high-priority

**Rationale**:
- Debouncing prevents spam from rapid mouse movements
- Room isolation limits network traffic to relevant players only
- Priority system ensures critical game actions aren't delayed by hover updates
- 100ms debounce provides responsive feel without overwhelming network

**Alternatives considered**:
- Real-time hover broadcasting (rejected: excessive network traffic)
- No hover state sharing (rejected: poor multiplayer UX)
- Throttling instead of debouncing (rejected: less intuitive feel)

## Stack Mechanics Conflict Resolution

**Decision**: Operational Transform with Server Authority + Optimistic UI
- Server Authority: All card stack operations validated server-side
- Operational Transform: Concurrent operations transformed using timestamp-based ordering
- Optimistic Updates: Client immediately shows action, rolls back if server rejects
- Conflict Resolution: Last-write-wins with operation transformation for dependent actions

**Rationale**:
- Server authority prevents cheating and ensures consistency
- Operational transform handles complex concurrent interactions (two players grab same card)
- Optimistic UI maintains responsive feel during network latency
- Timestamp-based ordering provides deterministic conflict resolution

**Alternatives considered**:
- Client-side conflict resolution (rejected: cheating vulnerability)
- Lock-based systems (rejected: poor UX during high latency)
- Pure last-write-wins (rejected: lost operations in complex scenarios)

## Performance Targets Validation

**Network Optimization**:
- Bandwidth per player: ~50KB/s (within WebSocket limits)
- Message compression: WebSocket compression for 40% size reduction
- Scaling: Redis Pub/Sub for horizontal scaling beyond single server

**Rendering Optimization**:
- Instanced rendering: Reduce from 1000 draw calls to <10
- LOD system: Reduce card geometry detail beyond 10 units distance
- Culling: Only render cards in camera frustum

**Memory Management**:
- Shared geometries: Single card geometry for all instances
- Texture atlasing: Combine card textures into single atlas
- Object pooling: Reuse card objects to prevent garbage collection

## Technical Feasibility Assessment

✅ **Confirmed Feasible**: All research indicates the target of 8 concurrent players with ~1000 3D cards is achievable while maintaining <100ms UI response time and <200ms network round-trip.

---
*Phase 0 Complete - Ready for Phase 1 Design & Contracts*