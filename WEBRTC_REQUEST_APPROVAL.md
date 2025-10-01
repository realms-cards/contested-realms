# WebRTC Request/Approval Flow Implementation

## Overview

WebRTC connections in online games now require explicit request and approval from both players before establishing voice/video connections. This prevents automatic connections and gives players control over their privacy.

## Architecture

### Client-Side Flow

**1. Join Voice Room (Announce Presence)**
```typescript
// Player A joins room (no auto-connection)
voiceRtc.join()
// → Emits 'rtc:join' to server
// → Server tracks participant but doesn't initiate WebRTC
```

**2. Request Connection**
```typescript
// Player A requests connection to Player B
requestVoiceConnection(playerB.id)
// → Emits 'rtc:request' with targetId
// → Server forwards to Player B
```

**3. Respond to Request**
```typescript
// Player B receives request and responds
respondToVoiceRequest(requestId, requesterId, accepted)
// → Emits 'rtc:request:respond'
// → Server notifies Player A
```

**4. Establish WebRTC Connection**
```typescript
// After both approve, initiate WebRTC
voiceRtc.initiateConnection()
// → Gets local media tracks
// → Creates peer connection
// → Begins SDP negotiation
```

### Server Events

#### Client → Server
- `rtc:join` - Announce presence in voice room (no auto-connection)
- `rtc:request` - Request connection to specific player
- `rtc:request:respond` - Accept/decline connection request
- `rtc:signal` - WebRTC signaling (SDP/ICE) after approval
- `rtc:leave` - Leave voice room

#### Server → Client
- `rtc:peer-joined` - Another player joined room (tracked, not connected)
- `rtc:participants` - Current room participant list
- `rtc:request` - Incoming connection request
- `rtc:request:sent` - Outgoing request acknowledged
- `rtc:request:accepted` - Request was accepted
- `rtc:request:declined` - Request was declined
- `rtc:request:ack` - Response acknowledged
- `rtc:request:cancelled` - Request was cancelled
- `rtc:signal` - WebRTC signaling from peer
- `rtc:peer-left` - Peer left the room

## Implementation Details

### Modified Files

**1. [src/lib/rtc/useMatchWebRTC.ts](src/lib/rtc/useMatchWebRTC.ts)**

Key changes:
- `handlePeerJoined` - Removed auto-connection, now only tracks participants
- `handleParticipants` - Removed auto-offer, waits for request/approval
- `join()` - Modified to announce presence without media connection
- `initiateConnection()` - New method to establish WebRTC after approval

**2. [src/app/online/layout.tsx](src/app/online/layout.tsx)**

Key changes:
- `attemptVoiceConnection()` - New callback to initiate WebRTC connection
- `respondToVoiceRequest()` - Updated to call `initiateConnection()` on accept
- `handleVoiceAccepted()` - Initiates connection when request accepted
- `handleVoiceAck()` - Initiates connection on acknowledgement

**3. [tests/integration/server-signaling.test.ts](tests/integration/server-signaling.test.ts)**

New test coverage:
- `rtc:join announces presence without auto-connecting`
- `WebRTC connection requires explicit request/approval`
- `declined connection request is properly communicated`
- `multiple connection requests are handled independently`
- `connection requests are scoped to lobby/match`

## User Flow

### In-Game Connection Request (Video Overlay Button)

When players are in a match, they use the video overlay controls to request connection:

1. Player A in match → Expands video overlay (clicks avatar/settings)
2. Player A clicks green "Join" button
3. System joins voice room + sends connection request to Player B
4. Player B receives notification dialog
5. Player B accepts/declines the request
6. If accepted: WebRTC connection establishes
7. If declined: Players remain in match without voice

**Implementation**: The "Join" button in `SeatMediaControls` calls both `rtc.join()` (room presence) and `voice.requestConnection(opponentId)` (connection request).

### Lobby Connection Request (Explicit Button)

In the lobby, players manually request connections via UI:

1. Player A in lobby
2. Player A clicks "Request Voice Chat" button for Player B
3. UI shows "Request Pending..." state
4. Player B receives notification dialog
5. Player B clicks "Accept" or "Decline"
6. If accepted: WebRTC connection establishes
7. If declined: Player A sees "Request Declined" message

### Request States

**Outgoing Request (Requester's View)**
- `sending` - Request is being sent
- `pending` - Waiting for response
- `accepted` - Other player accepted
- `declined` - Other player declined
- `cancelled` - Request was cancelled

**Incoming Request (Recipient's View)**
- Active request shown in UI
- Accept button → Initiates connection
- Decline button → Rejects request
- Auto-dismiss after timeout (optional)

## UI Components

### Request Dialog (Incoming)
```tsx
{incomingVoiceRequest && (
  <div className="request-dialog">
    <p>{incomingVoiceRequest.from.displayName} wants to connect</p>
    <button onClick={() => respondToVoiceRequest(
      incomingVoiceRequest.requestId,
      incomingVoiceRequest.from.id,
      true
    )}>
      Accept
    </button>
    <button onClick={() => respondToVoiceRequest(
      incomingVoiceRequest.requestId,
      incomingVoiceRequest.from.id,
      false
    )}>
      Decline
    </button>
  </div>
)}
```

### Request Status (Outgoing)
```tsx
{outgoingVoiceRequest && (
  <div className="request-status">
    {outgoingVoiceRequest.status === 'pending' && (
      <p>Waiting for {targetPlayer.displayName}...</p>
    )}
    {outgoingVoiceRequest.status === 'accepted' && (
      <p>Request accepted. Connecting...</p>
    )}
    {outgoingVoiceRequest.status === 'declined' && (
      <p>Request declined by {targetPlayer.displayName}</p>
    )}
  </div>
)}
```

## Security & Privacy

### Benefits
- **User Control**: Players explicitly approve connections
- **Privacy Protection**: No automatic media access
- **Selective Connections**: Choose who to connect with
- **Clear Intent**: Both parties must agree

### Server Validation
- Requests scoped to lobby/match
- Target must be in same room
- No cross-match requests
- Request expiration (server-side)
- Duplicate request prevention

## Migration Notes

### Before (Auto-Connect)
```typescript
// Old behavior
voiceRtc.join() // → Automatically established WebRTC with all peers
```

### After (Request/Approval)
```typescript
// New behavior
voiceRtc.join() // → Only announces presence

// Explicit request required
requestVoiceConnection(peerId) // → Send request
// → Wait for approval
// → Connection established after acceptance
```

### Backward Compatibility

The server already had the complete `rtc:request` infrastructure implemented. This change updates the client to properly integrate with the existing server request/response flow.

## Testing

Run integration tests:
```bash
npm test tests/integration/server-signaling.test.ts
```

Key test scenarios:
- ✓ Room join without auto-connection
- ✓ Request/approval flow
- ✓ Request decline handling
- ✓ Multiple independent requests
- ✓ Request scoping (lobby/match isolation)
- ✓ Cleanup on disconnect

## Future Enhancements

1. **Request Timeout**: Auto-expire requests after 30 seconds
2. **Bulk Accept**: Accept all pending requests at once
3. **Auto-Accept List**: Trusted players auto-approved
4. **Request History**: Track connection request history
5. **Notification Sound**: Audio cue for incoming requests
6. **Push Notifications**: System notifications when game in background

## Troubleshooting

### Connection Not Establishing
- **Check**: Both players accepted the request?
- **Check**: Both players in same lobby/match?
- **Check**: Media permissions granted?
- **Check**: Network connectivity (STUN/TURN servers)

### Request Not Received
- **Check**: Target player in voice room?
- **Check**: Request sent to correct player ID?
- **Check**: WebSocket connection active?
- **Check**: Server logs for errors

### State Stuck in "Pending"
- **Fix**: Cancel and retry request
- **Check**: Server acknowledged request? (check `rtc:request:sent`)
- **Check**: Target player online?

## References

- [useMatchWebRTC.ts](src/lib/rtc/useMatchWebRTC.ts) - Core WebRTC hook
- [online/layout.tsx](src/app/online/layout.tsx) - Request/approval UI logic
- [server/index.js](server/index.js) - Server-side request handlers (lines 4238-4425)
- [server-signaling.test.ts](tests/integration/server-signaling.test.ts) - Integration tests
