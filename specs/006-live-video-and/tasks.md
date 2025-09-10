# Tasks: Live Video and Audio Integration

**Input**: Design documents from `/specs/006-live-video-and/`  
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
Web app structure: Frontend (`src/`) with backend (`server/`)

## Phase 3.1: Setup & Research
- [ ] T001 Analyze existing WebRTC components for extension points
- [ ] T002 [P] Set up test fixtures for WebRTC mocking in `tests/fixtures/webrtc-mock.ts`
- [ ] T003 [P] Configure test environment for Socket.IO server in `tests/setup-server.ts`

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests [P]
- [ ] T004 [P] Contract test for useGlobalWebRTC hook interface in `tests/contract/webrtc-hooks.test.ts`
- [ ] T005 [P] Contract test for VideoOverlayProvider interface in `tests/contract/video-overlay.test.ts`
- [ ] T006 [P] Contract test for server WebRTC events in `tests/contract/server-events.test.ts`
- [ ] T007 [P] Contract test for UI components interfaces in `tests/contract/ui-components.test.ts`

### Integration Tests [P]
- [ ] T008 [P] Integration test for WebRTC connection establishment in `tests/integration/webrtc-connection.test.ts`
- [ ] T009 [P] Integration test for video overlay mounting across screens in `tests/integration/video-overlay-screens.test.ts`
- [ ] T010 [P] Integration test for server signaling with participant tracking in `tests/integration/server-signaling.test.ts`
- [ ] T011 [P] Integration test for device permission recovery in `tests/integration/device-permissions.test.ts`
- [ ] T012 [P] Integration test for 3D video seat positioning in `tests/integration/seat-video-3d.test.ts`

## Phase 3.3: Server-Side Enhancements (ONLY after tests are failing)
- [ ] T013 Fix server WebRTC participant tracking in `server/index.js` - add rtcParticipants Map
- [ ] T014 Enhance server rtc:join handler with participant registration in `server/index.js`
- [ ] T015 Improve server rtc:signal scoped message delivery in `server/index.js`
- [ ] T016 Add server rtc:leave participant cleanup in `server/index.js`
- [ ] T017 Add server connection failure reporting in `server/index.js`

## Phase 3.4: Client-Side Core Components
### Enhanced WebRTC Hook
- [ ] T018 [P] Create useGlobalWebRTC hook with error recovery in `src/lib/hooks/useGlobalWebRTC.ts`
- [ ] T019 [P] Add permission checking utilities in `src/lib/utils/webrtc-permissions.ts`
- [ ] T020 [P] Create device management utilities in `src/lib/utils/device-management.ts`

### Video Overlay Context System  
- [ ] T021 [P] Create VideoOverlayContext with React Context in `src/lib/contexts/VideoOverlayContext.tsx`
- [ ] T022 [P] Create screen type configuration mapping in `src/lib/config/screen-overlay-config.ts`
- [ ] T023 [P] Create seat position calculation utilities in `src/lib/utils/seat-positioning.ts`

## Phase 3.5: UI Component Implementation
### Global Overlay Components [P]
- [ ] T024 [P] Create GlobalVideoOverlay component in `src/components/ui/GlobalVideoOverlay.tsx`
- [ ] T025 [P] Create UserAvatarMenu component in `src/components/ui/UserAvatarMenu.tsx`
- [ ] T026 [P] Create MediaControlsPanel component in `src/components/ui/MediaControlsPanel.tsx`
- [ ] T027 [P] Create ConnectionStatusIndicator component in `src/components/ui/ConnectionStatusIndicator.tsx`
- [ ] T028 [P] Create PermissionRequestDialog component in `src/components/ui/PermissionRequestDialog.tsx`
- [ ] T029 [P] Create DeviceSelectionMenu component in `src/components/ui/DeviceSelectionMenu.tsx`

### Video Display Components [P]
- [ ] T030 [P] Create VideoStreamOverlay component in `src/components/ui/VideoStreamOverlay.tsx`
- [ ] T031 Enhance existing SeatVideo3D component with new props in `src/lib/rtc/SeatVideo3D.tsx`

## Phase 3.6: Integration & Screen Mounting
- [ ] T032 Integrate VideoOverlayProvider into app layout in `src/app/layout.tsx`
- [ ] T033 Add GlobalVideoOverlay to multiplayer screen: OnlineDraftScreen in `src/components/game/OnlineDraftScreen.tsx`
- [ ] T034 Add GlobalVideoOverlay to multiplayer screen: OnlineDraft3DScreen in `src/components/game/OnlineDraft3DScreen.tsx`
- [ ] T035 Add GlobalVideoOverlay to multiplayer screen: EnhancedOnlineDraft3DScreen in `src/components/game/EnhancedOnlineDraft3DScreen.tsx`
- [ ] T036 Add GlobalVideoOverlay to game screens: OnlineD20Screen, OnlineStatusBar
- [ ] T037 Update existing SeatMediaControls usage with enhanced hook in `src/components/rtc/SeatMediaControls.tsx`

## Phase 3.7: Error Handling & Polish
### Error Recovery [P]
- [ ] T038 [P] Add WebRTC error logging and reporting in `src/lib/utils/webrtc-logging.ts`
- [ ] T039 [P] Create error recovery strategies in `src/lib/utils/webrtc-recovery.ts`
- [ ] T040 [P] Add connection retry logic with exponential backoff in `src/lib/utils/connection-retry.ts`

### Performance & Validation [P]  
- [ ] T041 [P] Unit tests for permission utilities in `tests/unit/webrtc-permissions.test.ts`
- [ ] T042 [P] Unit tests for device management in `tests/unit/device-management.test.ts`
- [ ] T043 [P] Unit tests for seat positioning calculations in `tests/unit/seat-positioning.test.ts`
- [ ] T044 Performance test: video texture rendering with 60fps target in `tests/performance/video-texture.test.ts`
- [ ] T045 Cross-screen transition performance test in `tests/performance/screen-transitions.test.ts`

### Documentation & Validation
- [ ] T046 [P] Update component JSDoc for all new components 
- [ ] T047 [P] Create usage examples in component files
- [ ] T048 Run quickstart.md validation scenarios
- [ ] T049 Update CLAUDE.md with integration status

## Dependencies
```
Setup (T001-T003) 
  ↓
Contract Tests (T004-T007) + Integration Tests (T008-T012)
  ↓
Server Enhancements (T013-T017)
  ↓ 
Client Core (T018-T023)
  ↓
UI Components (T024-T031) 
  ↓
Screen Integration (T032-T037)
  ↓
Polish (T038-T049)
```

## Parallel Execution Examples

### Phase 3.2: All contract and integration tests can run in parallel:
```bash
# Contract tests (can run simultaneously)
Task: "Contract test for useGlobalWebRTC hook interface in tests/contract/webrtc-hooks.test.ts"
Task: "Contract test for VideoOverlayProvider interface in tests/contract/video-overlay.test.ts" 
Task: "Contract test for server WebRTC events in tests/contract/server-events.test.ts"
Task: "Contract test for UI components interfaces in tests/contract/ui-components.test.ts"

# Integration tests (can run simultaneously)
Task: "Integration test for WebRTC connection establishment in tests/integration/webrtc-connection.test.ts"
Task: "Integration test for video overlay mounting across screens in tests/integration/video-overlay-screens.test.ts"
```

### Phase 3.4: Core components can be built in parallel:
```bash
Task: "Create useGlobalWebRTC hook with error recovery in src/lib/hooks/useGlobalWebRTC.ts"
Task: "Add permission checking utilities in src/lib/utils/webrtc-permissions.ts"
Task: "Create VideoOverlayContext with React Context in src/lib/contexts/VideoOverlayContext.tsx"
```

### Phase 3.5: All UI components can be built in parallel:
```bash
Task: "Create GlobalVideoOverlay component in src/components/ui/GlobalVideoOverlay.tsx"
Task: "Create UserAvatarMenu component in src/components/ui/UserAvatarMenu.tsx"
Task: "Create MediaControlsPanel component in src/components/ui/MediaControlsPanel.tsx"
Task: "Create ConnectionStatusIndicator component in src/components/ui/ConnectionStatusIndicator.tsx"
```

## Validation Checklist
*GATE: Checked before task execution*

- [x] All contracts have corresponding tests (T004-T007)
- [x] All entities have implementation tasks (WebRTC state, overlay config, etc.)
- [x] All tests come before implementation (Phase 3.2 before 3.3+)
- [x] Parallel tasks truly independent (different files, no shared state)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task

## Task Generation Summary
- **Contract Tests**: 4 tasks from 4 contract files
- **Integration Tests**: 5 tasks from quickstart scenarios  
- **Server Tasks**: 5 tasks to fix WebRTC signaling issues
- **Client Core**: 6 tasks for hooks and context system
- **UI Components**: 8 tasks for overlay system components
- **Integration**: 6 tasks to mount on existing screens
- **Polish**: 12 tasks for error handling, testing, and documentation

**Total**: 49 tasks focusing on fixing existing WebRTC issues and extending with overlay system