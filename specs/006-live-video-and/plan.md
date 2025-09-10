# Implementation Plan: Live Video and Audio Integration

**Branch**: `006-live-video-and` | **Date**: 2025-01-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-live-video-and/spec.md`

## Summary
Integrate existing WebRTC video/audio components across all multiplayer screens as a global overlay system. Fix server-side WebRTC negotiations and enhance client-side reliability. Display video at player seats in games, audio-only in drafting/editing modes. Add user avatar menu with media controls.

## Technical Context
**Language/Version**: TypeScript 5.x, React 19.1.0, Next.js 15.5.0  
**Primary Dependencies**: Socket.IO 4.x, React Three Fiber 9.3.0, Three.js 0.179.1, Lucide React  
**Storage**: In-memory state on server, client-side WebRTC streams  
**Testing**: Vitest 2.0.5 with React Testing Library  
**Target Platform**: Web browsers with WebRTC support  
**Project Type**: web - Next.js frontend with Node.js Socket.IO backend  
**Performance Goals**: <200ms WebRTC connection establishment, 60fps 3D rendering with video textures  
**Constraints**: WebRTC peer-to-peer limitations (~8 concurrent users), browser permission requirements  
**Scale/Scope**: 18 multiplayer screen components, 3 existing RTC components to extend

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (frontend React app, backend Node.js server) ✓
- Using framework directly? ✓ (React Three Fiber, Socket.IO directly)
- Single data model? ✓ (MediaStream and WebRTC state only)  
- Avoiding patterns? ✓ (No unnecessary abstractions over WebRTC)

**Architecture**:
- EVERY feature as library? ✓ (WebRTC hook, overlay components as reusable libs)
- Libraries listed: 
  - `useGlobalWebRTC` - Global WebRTC session management
  - `VideoOverlayProvider` - Context provider for video overlay state
  - `UserAvatarMenu` - User settings menu with media controls
- CLI per library: Not applicable (React components)
- Library docs: Component JSDoc and usage examples planned ✓

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? ✓
- Git commits show tests before implementation? ✓ (Will follow TDD)
- Order: Contract→Integration→E2E→Unit strictly followed? ✓
- Real dependencies used? ✓ (Real WebRTC APIs, actual Socket.IO server)
- Integration tests for: WebRTC connection establishment, video overlay mounting, server signaling
- FORBIDDEN: Implementation before test ✓

**Observability**:
- Structured logging included? ✓ (WebRTC connection states, device errors)
- Frontend logs → backend? ✓ (Socket.IO error reporting)
- Error context sufficient? ✓ (Device permissions, connection failures)

**Versioning**:
- Version number assigned? 0.1.1 (BUILD increment)
- BUILD increments on every change? ✓
- Breaking changes handled? N/A (additive feature)

## Project Structure

### Documentation (this feature)
```
specs/006-live-video-and/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 2: Web application (frontend + backend detected)
backend/ (server/)
├── index.js             # Socket.IO server with WebRTC signaling (existing)
└── (WebRTC enhancements)

frontend/ (src/)
├── components/
│   ├── rtc/            # Existing WebRTC components
│   └── ui/             # New overlay components  
├── lib/
│   ├── hooks/          # Global WebRTC hook
│   └── contexts/       # Video overlay context
└── app/                # Next.js app router
```

**Structure Decision**: Option 2 (Web application) - existing Next.js frontend with Node.js backend

## Phase 0: Outline & Research

### Research Tasks Identified:
1. **Current WebRTC Issues Analysis**: 
   - Why server negotiations failing despite browser permission prompts
   - Existing `useMatchWebRTC` hook limitation analysis
   - Server-side signaling relay completeness review

2. **Global State Management**:
   - Best practices for WebRTC state across React component tree
   - Context vs Zustand for video overlay state
   - Stream persistence during navigation

3. **Three.js Video Integration**:
   - VideoTexture performance with multiple streams
   - 3D positioning strategies for seat-based video
   - Audio spatialization vs direct audio element playback

4. **Device Management Patterns**:
   - MediaDevices API best practices for device switching
   - Permission handling and recovery strategies
   - Device enumeration caching and refresh patterns

**Research consolidation** will resolve these unknowns and determine concrete technical approaches.

## Phase 1: Design & Contracts

### Expected Entities (from spec):
- **GlobalWebRTCState**: Connection status, local/remote streams, device lists
- **VideoOverlayConfig**: Show/hide rules per screen type, positioning preferences
- **UserMediaSettings**: Device selections, mute states, permission status
- **SeatVideoPlacement**: 3D world positions for video streams in games

### Contract Generation Strategy:
- WebRTC hook interface contracts (input props, return values)
- Component prop interfaces for overlay system
- Server event message schemas for enhanced signaling
- Permission and error state definitions

### Integration Test Scenarios:
- WebRTC connection establishment across screen transitions
- Video display toggling between seat/audio-only modes
- Device permission recovery workflows
- Server signaling message routing

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load contracts from Phase 1 → contract test tasks
- Load data model entities → model/hook creation tasks
- Load integration scenarios → integration test tasks
- Fix existing WebRTC server issues → debugging/enhancement tasks

**Ordering Strategy**:
- Fix server signaling issues first (enables all client testing)
- Create global state management (foundation for all components)
- Enhance existing RTC components (build on working base)
- Add overlay system (final integration layer)
- Mark [P] for independent component work

**Estimated Output**: 20-25 numbered tasks focusing on fixing and extending existing components

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (fix server issues, enhance client components)  
**Phase 5**: Validation (WebRTC connection tests, cross-screen overlay verification)

## Complexity Tracking
*No constitutional violations identified*

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*