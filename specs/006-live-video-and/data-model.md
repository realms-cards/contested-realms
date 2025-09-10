# Data Model: Live Video and Audio Integration

**Date**: 2025-01-09  
**Phase**: Phase 1 - Design & Contracts

## Core Entities

### GlobalWebRTCState
**Purpose**: Manages WebRTC connection state across the entire application.

**Fields**:
- `connectionState: RtcState` - Current connection status ('idle' | 'joining' | 'negotiating' | 'connected' | 'failed' | 'closed')
- `localStream: MediaStream | null` - User's camera/microphone stream
- `remoteStream: MediaStream | null` - Opponent's incoming stream
- `lastError: string | null` - Most recent error message for user feedback
- `permissionsGranted: boolean` - Whether camera/microphone access approved
- `matchId: string | null` - Current match/session identifier
- `remotePeerId: string | null` - Connected peer's identifier

**Validation Rules**:
- `matchId` required when `connectionState` is not 'idle'
- `localStream` must be present when `connectionState` is 'connected' or 'negotiating'
- `lastError` cleared when transitioning to 'connected' state

**State Transitions**:
```
idle → joining → negotiating → connected
  ↓      ↓           ↓           ↓
  ←------←-----------←-----------← (failed/closed)
```

### VideoOverlayConfig
**Purpose**: Determines video display behavior per screen type.

**Fields**:
- `screenType: ScreenType` - Current application screen type
- `showVideo: boolean` - Whether video should be rendered visually
- `showControls: boolean` - Whether media controls should be visible
- `audioOnly: boolean` - Audio transmission without video display
- `seatPosition: Vector3 | null` - 3D position for video display in seated games

**Screen Types**:
```typescript
type ScreenType = 
  | 'draft' | 'draft-3d' | 'deck-editor' 
  | 'game' | 'game-3d' | 'lobby' | 'leaderboard'
```

**Business Rules**:
- Seated games (`game`, `game-3d`): `showVideo: true`, `seatPosition: Vector3`
- Non-seated contexts (`draft`, `deck-editor`): `showVideo: false`, `audioOnly: true`
- Lobby/social screens: `showVideo: true`, `seatPosition: null` (overlay mode)

### UserMediaSettings
**Purpose**: User preferences for media devices and behavior.

**Fields**:
- `selectedAudioDeviceId: string | null` - Chosen microphone device
- `selectedVideoDeviceId: string | null` - Chosen camera device  
- `microphoneMuted: boolean` - Microphone mute state
- `cameraDisabled: boolean` - Camera disable state
- `audioDevices: MediaDeviceInfo[]` - Available audio input devices
- `videoDevices: MediaDeviceInfo[]` - Available video input devices
- `devicePermissionStatus: PermissionState` - Browser permission status

**Validation Rules**:
- Device IDs must exist in corresponding device arrays when not null
- Device arrays empty until permissions granted
- Settings persist across sessions in localStorage

### SeatVideoPlacement
**Purpose**: 3D world positioning for video streams in games.

**Fields**:
- `playerId: string` - Player identifier for this video stream
- `worldPosition: Vector3` - 3D coordinates in world space
- `rotation: number` - Y-axis rotation toward board center
- `dimensions: { width: number; height: number }` - Video plane size
- `visible: boolean` - Whether video should render at this position

**Calculation Rules**:
- Position derived from player seat coordinates on game board
- Rotation always faces toward board center (0,0,0)
- Dimensions scale with board size (default: TILE_SIZE * 1.2)
- Height auto-calculated as 16:9 aspect ratio from width

## Relationships

### WebRTC State → Overlay Config
- `GlobalWebRTCState.connectionState` determines `VideoOverlayConfig.showControls`
- Connection required for video display in any mode

### User Settings → WebRTC State  
- `UserMediaSettings` device selections applied to `GlobalWebRTCState.localStream`
- Mute states control track enabled/disabled properties
- Permission status gates media stream creation

### Overlay Config → Video Placement
- `VideoOverlayConfig.seatPosition` populates `SeatVideoPlacement.worldPosition`
- Screen type determines placement strategy (3D vs overlay)

## State Management Architecture

### Context Structure
```typescript
interface VideoOverlayContextValue {
  // Global WebRTC state
  rtcState: GlobalWebRTCState;
  
  // Screen-specific configuration
  overlayConfig: VideoOverlayConfig;
  
  // User preferences  
  mediaSettings: UserMediaSettings;
  
  // Actions
  updateScreenType: (type: ScreenType) => void;
  updateMediaSettings: (settings: Partial<UserMediaSettings>) => void;
}
```

### Persistence Strategy
- **Session State**: WebRTC connection state (memory only)
- **User Preferences**: Device selections and mute states (localStorage)
- **Screen Context**: Current screen type and overlay config (React state)

## Error States

### Connection Errors
- `negotiation-failed`: WebRTC peer connection establishment failed
- `media-access-denied`: Browser denied camera/microphone permissions
- `device-not-found`: Selected audio/video device no longer available
- `network-disconnected`: Network connection lost during session

### Recovery Actions
- `negotiation-failed`: Retry connection establishment once
- `media-access-denied`: Show permission instructions, allow retry
- `device-not-found`: Fall back to default device, refresh device list
- `network-disconnected`: Maintain UI state, auto-reconnect when network restored

## Performance Considerations

### Stream Lifecycle
- Local stream created once per session, reused across screen transitions
- Remote stream destroyed/recreated per peer connection
- VideoTexture references updated without recreating GPU resources

### Memory Management
- Device arrays refreshed only on permission changes or device connect/disconnect
- Error states cleared on successful state transitions
- Cleanup hooks prevent memory leaks during component unmounting

## Integration Points

### Server Events
- WebRTC state updates trigger server event emissions
- Server participant tracking enables proper peer discovery
- Connection lifecycle synchronized with match/lobby state

### 3D Rendering
- Video streams converted to Three.js VideoTexture objects
- Texture updates handled by React Three Fiber lifecycle
- Audio playback via separate HTML5 audio elements (not spatialized)