# Research: Tournament MVP

**Date**: 2025-01-09  
**Research Status**: Complete  
**All NEEDS CLARIFICATION Resolved**: ✅

## Research Topics

### 1. Tournament Bracket Types
**Decision**: Swiss pairing system with Swiss tournament rounds  
**Rationale**: 
- Swiss system allows all players to play multiple rounds regardless of wins/losses
- Fair pairing mechanism already implemented in existing `src/lib/tournament/pairing.ts`
- Suitable for tournaments with 8-32 players
- More engaging than single elimination for digital tournaments

**Alternatives considered**:
- Single elimination: Too harsh, players eliminated early have poor experience
- Round robin: Too many matches for larger tournaments (O(n²) complexity)
- Double elimination: More complex bracket management, harder to implement

### 2. Maximum Tournament Size Limits
**Decision**: 8-32 players per tournament  
**Rationale**:
- Swiss pairing scales well in this range (4-6 rounds optimal)
- Matches existing multiplayer infrastructure capacity (8 players per draft)
- Tournament preparation phases manageable with this size
- Statistics overlay remains readable and meaningful

**Alternatives considered**:
- Unlimited size: Would strain Socket.io connections and statistics rendering
- 8 players max: Too restrictive for competitive tournaments
- 64+ players: Requires additional infrastructure for bracket management

### 3. Tournament Scheduling
**Decision**: Real-time synchronized phases with async match execution  
**Rationale**:
- Tournament phases (registration, preparation, matches) synchronized in real-time
- Individual matches can be played asynchronously within round time limits
- Leverages existing Socket.io infrastructure for real-time coordination
- Provides flexibility for different player availability while maintaining tournament integrity

**Alternatives considered**:
- Fully real-time: Too restrictive, requires all players online simultaneously
- Fully async: Loses tournament atmosphere and engagement
- Turn-based scheduling: Not suitable for competitive tournament format

## Technical Research

### Socket.io Tournament Events Architecture
**Finding**: Extend existing Socket.io room-based system for tournament coordination
- Tournament rooms for participant communication
- Phase transition broadcasts to all participants
- Real-time standings updates
- Draft session coordination for draft tournaments

### Prisma Schema Extensions Required
**Finding**: Existing tournament schema needs enhancements for:
- Tournament settings (pack configuration, time limits)
- Preparation phase tracking (sealed packs opened, draft completion, deck selection)
- Enhanced statistics (match history, performance metrics)
- Feature flag support in configuration table

### UI/UX Design Patterns
**Finding**: Modern tournament overlay design principles:
- Full-screen overlay with tournament branding
- Real-time statistics dashboard with animated updates
- Phase progress indicators with clear CTAs
- Mobile-responsive design for cross-device access
- Dark/light theme support matching existing app design

### Type Safety Implementation
**Finding**: Strict TypeScript patterns for tournament system:
- Zod schemas for all tournament data validation
- Discriminated unions for tournament phases
- Generic types for format-specific settings
- No `any` types - use strict typing throughout
- Type-safe Socket.io event definitions

## Best Practices Research

### Tournament State Management
**Decision**: Extend Zustand store with tournament slice
**Rationale**: 
- Consistent with existing game state management
- Real-time state synchronization with Socket.io
- Immutable updates with tournament phase transitions
- Type-safe state updates and selectors

### Error Handling Patterns
**Decision**: Tournament-specific error boundaries with user-friendly messaging
**Rationale**:
- Graceful degradation when tournament features unavailable
- Clear error messages for common tournament scenarios
- Automatic retry mechanisms for network-related failures
- Fallback UI states for offline scenarios

### Performance Optimization
**Decision**: Lazy loading and virtual scrolling for large tournament data
**Rationale**:
- Statistics overlay may contain large datasets
- Player lists and match history can be extensive
- Maintains 60fps performance requirement
- Efficient re-rendering with React.memo and selective updates

## Integration Patterns

### Draft System Integration
**Finding**: Enhanced multiplayer draft for tournaments requires:
- Tournament context in draft sessions
- Participant validation against tournament registration
- Draft completion tracking for tournament progression
- Deck building integration post-draft

### Game Flow Integration  
**Finding**: Tournament matches integrate with existing game system:
- Tournament context passed to game instances
- Match result reporting to tournament system
- Statistics collection during tournament games
- Spectator mode for tournament matches

---

**Resolution Status**: All NEEDS CLARIFICATION items from spec resolved ✅