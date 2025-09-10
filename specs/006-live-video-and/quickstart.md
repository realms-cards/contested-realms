# Quickstart: Live Video and Audio Integration

**Date**: 2025-01-09  
**Phase**: Phase 1 - Integration Testing Scenarios

## Overview
This quickstart validates the core user scenarios for live video and audio integration across multiplayer screens.

## Prerequisites
- Node.js server running on port 3010
- Next.js development server running on port 3000
- Two browser windows/devices for testing peer connections
- Camera and microphone permissions granted in browser

## Test Scenario 1: Basic WebRTC Connection
**Goal**: Verify WebRTC connection establishment between two players

### Steps:
1. **Start Application**
   ```bash
   # Terminal 1: Start server
   npm run server
   
   # Terminal 2: Start frontend  
   npm run dev
   ```

2. **Join Match Session**
   - Open browser 1: `http://localhost:3000`
   - Create/join a match as Player 1
   - Open browser 2: `http://localhost:3000` 
   - Join same match as Player 2

3. **Enable Video/Audio**
   - In both browsers, click video controls overlay
   - Allow camera/microphone permissions when prompted
   - Click "Join Video" button

4. **Verify Connection**
   - Connection status should show "connected" 
   - Local video should appear in each browser
   - Remote video should appear showing other player
   - Audio should work bidirectionally

### Expected Results:
- ✅ WebRTC connection established within 5 seconds
- ✅ Both video streams visible and smooth
- ✅ Audio transmission working both directions
- ✅ No console errors related to WebRTC

## Test Scenario 2: Video Display Modes
**Goal**: Verify video shows at player seats in games, audio-only in drafting

### Steps:
1. **Test Game Mode (3D seats)**
   - Navigate both players to game-3d screen
   - Enable video in both browsers
   - Verify video appears at player seat positions in 3D space
   - Video should face toward board center

2. **Test Draft Mode (audio only)**
   - Navigate both players to draft screen
   - Video controls should remain visible
   - Remote video display should be hidden
   - Audio should continue working

3. **Test Screen Transitions**
   - Switch between game and draft screens
   - Video/audio session should persist
   - Display mode should update correctly

### Expected Results:
- ✅ 3D games: Video at seat positions, properly oriented
- ✅ Draft/editor: Audio only, no video display
- ✅ Session persists across screen transitions
- ✅ Controls always accessible regardless of mode

## Test Scenario 3: User Settings & Device Management
**Goal**: Verify user avatar menu and device selection works

### Steps:
1. **Access Settings Menu**
   - Look for user avatar icon in top-right corner
   - Click avatar to reveal settings menu
   - Media controls should be accessible in menu

2. **Test Device Selection**
   - Open device settings in media controls
   - Switch between available cameras (if multiple)
   - Switch between available microphones
   - Verify stream updates with new devices

3. **Test Mute Controls**
   - Toggle microphone mute/unmute
   - Toggle camera disable/enable
   - Verify visual indicators update
   - Verify remote peer sees changes

### Expected Results:
- ✅ User avatar menu appears and functions
- ✅ Device switching works without connection loss
- ✅ Mute/unmute controls function properly
- ✅ Visual feedback matches actual state

## Test Scenario 4: Error Recovery
**Goal**: Verify graceful handling of common failure scenarios

### Steps:
1. **Permission Denied Recovery**
   - Deny camera/microphone permissions initially
   - UI should show permission status clearly
   - Click retry/settings to re-request permissions
   - Grant permissions and verify recovery

2. **Network Disconnection Recovery**
   - Establish working video connection
   - Simulate network disconnection (disable WiFi briefly)
   - Re-enable network connection
   - Verify automatic reconnection attempts

3. **Device Disconnection Recovery**
   - Connect external camera/microphone
   - Select external device in settings
   - Disconnect external device
   - Verify fallback to default device

### Expected Results:
- ✅ Clear permission status and recovery instructions
- ✅ Automatic reconnection after network recovery
- ✅ Graceful fallback when devices disconnected
- ✅ No silent failures or hanging states

## Test Scenario 5: Performance Validation
**Goal**: Ensure video integration maintains target performance

### Steps:
1. **3D Rendering Performance**
   - Enable video in game-3d mode
   - Monitor browser performance tab
   - Move camera around 3D scene
   - Verify smooth 60fps rendering maintained

2. **Multiple Stream Handling**
   - Test with maximum expected users (2 players)
   - Monitor memory usage and CPU utilization
   - Verify no significant performance degradation

3. **Video Quality Assessment**
   - Check video resolution and clarity
   - Verify smooth playback without dropped frames
   - Test under various lighting conditions

### Expected Results:
- ✅ 60fps maintained in 3D scenes with video
- ✅ Memory usage within acceptable limits
- ✅ Video quality appropriate for game context
- ✅ No noticeable lag or performance issues

## Troubleshooting

### Common Issues:
1. **"Connection failed" status**
   - Check server console for WebRTC signaling errors
   - Verify both browsers are in same match/lobby
   - Try refreshing and rejoining

2. **"Permission denied" errors**
   - Check browser permission settings
   - Try incognito/private browsing mode
   - Ensure HTTPS or localhost (WebRTC requirement)

3. **Video not appearing at seat positions**
   - Check browser console for Three.js errors
   - Verify WebRTC connection established first
   - Check if game board properly initialized

4. **Audio/video out of sync**
   - Check network latency between browsers
   - Verify no multiple audio sources playing
   - Try toggling audio/video to reset streams

### Debug Commands:
```bash
# Check server WebRTC signaling logs
tail -f server/logs/webrtc.log

# Test WebRTC connectivity
npm run test:webrtc

# Performance profiling
npm run test:performance
```

## Success Criteria
All test scenarios must pass with expected results. The implementation should provide:

- ✅ Reliable WebRTC connection establishment
- ✅ Appropriate video display per screen type  
- ✅ Accessible user controls and settings
- ✅ Graceful error handling and recovery
- ✅ Maintained performance targets

## Next Steps
After successful quickstart validation:
1. Run full test suite: `npm test`
2. Performance profiling: `npm run test:performance` 
3. Cross-browser compatibility testing
4. Production deployment validation