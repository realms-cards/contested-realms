# S006: Prevent Patch Echo Overwrites

**Status:** Draft
**Priority:** P0 (Critical - causes data loss)
**Affected Components:** Server patch broadcasting, client patch reconciliation

## Problem Statement

When a client sends a game state patch to the server (e.g., moving a permanent), the server broadcasts that patch back to all clients **including the sender**. The sender's client then receives its own patch as a "server patch" and applies it, **overwriting** its local state with older data from the patch.

This causes:
1. **Permanent vanishing bug**: When Player A drags a permanent onto Player B's permanent, both cards disappear
2. **State regression**: Local optimistic updates are overwritten by server echoes of the same data
3. **Poor UX**: Actions appear to work then immediately revert

## Root Cause Analysis

### Current Flow (Broken)

```
1. Client A moves permanent "Knight" from tile "2,2" to "1,2"
   → Local state updated immediately: permanents["1,2"] = ["Knight"]
   → Patch sent to server: {permanents: {"1,2": ["Knight"], "2,2": []}}

2. Server receives patch from Client A
   → Broadcasts to ALL clients including Client A
   → Sends: statePatch({permanents: {"1,2": ["Knight"], "2,2": []}})

3. Client A receives its own patch from server
   → Applies patch from server (treated as authoritative)
   → Overwrites local state with patch data
   → If Client A made additional local changes, they are lost

4. Result: State flickers or regresses to stale data
```

### Evidence from Logs

```javascript
[Log] [store] moveSelectedPermanentToWithOffset AFTER – {
  movedName: "Adept Illusionist",
  fromPermanents: [],
  toPermanents: ["Daperyll Vampire", "Adept Illusionist"]
}
// ✅ Local state is correct

[Log] [statePatch] Received patch: – {
  keys: ["events", "eventSeq", "permanents", "avatars", "resources"]
}
// ❌ Server echo overwrites local state
// Cards "vanish" because patch contains stale data
```

### Why This Happens

1. **No sender exclusion**: Server broadcasts to `io.to(matchRoom).emit()` which includes the sender
2. **No patch deduplication**: Client doesn't track which patches it originated
3. **No timestamp comparison**: Client applies server patches without checking if local state is newer
4. **Full replacement**: Patches use full replacement semantics, not merges

## Proposed Solutions

### Option A: Server-Side Sender Exclusion (Recommended)

**Server excludes the patch sender from broadcasts**

```javascript
// server/index.js (current - broadcasts to everyone)
io.to(matchRoom).emit("statePatch", {
  patch: sanitizedPatch,
  t: timestamp
});

// server/index.js (proposed - exclude sender)
socket.to(matchRoom).emit("statePatch", {
  patch: sanitizedPatch,
  t: timestamp,
  origin: socket.id // Track origin for debugging
});
```

**Pros:**
- ✅ Simple server-side fix
- ✅ No client changes needed
- ✅ Prevents redundant network traffic
- ✅ Sender already has correct local state

**Cons:**
- ⚠️ Sender doesn't get server validation/correction
- ⚠️ If sender's patch is rejected, they won't know

**Mitigation:** Add explicit server validation responses for rejected patches

### Option B: Client-Side Patch Deduplication

**Client tracks outgoing patches and ignores matching echoes**

```typescript
// src/lib/game/store.ts
const pendingPatches = new Map<string, {patch: Patch, timestamp: number}>();

function trySendPatch(patch: ServerPatchT) {
  const patchId = generatePatchId(patch);
  pendingPatches.set(patchId, {patch, timestamp: Date.now()});
  transport.sendPatch(patch);

  // Cleanup after 5 seconds
  setTimeout(() => pendingPatches.delete(patchId), 5000);
}

function applyServerPatch(incoming: Patch) {
  const incomingId = generatePatchId(incoming.patch);

  // Ignore if this is our own patch echoed back
  if (pendingPatches.has(incomingId)) {
    console.debug('[patch] Ignoring echo of own patch', incomingId);
    pendingPatches.delete(incomingId);
    return;
  }

  // Apply patch normally
  // ...
}
```

**Pros:**
- ✅ Client has full control
- ✅ Can implement smart merging logic
- ✅ Works with current server

**Cons:**
- ❌ Complex client-side logic
- ❌ Patch ID generation must be deterministic
- ❌ Memory overhead for pending patches map
- ❌ Doesn't reduce network traffic

### Option C: Timestamp-Based Reconciliation

**Client compares timestamps and ignores older patches**

```typescript
const lastLocalUpdate = new Map<string, number>();

function moveSelectedPermanentToWithOffset(x: number, y: number, offset: [number, number]) {
  const now = Date.now();
  lastLocalUpdate.set('permanents', now);

  // Apply local change
  // Send patch to server with timestamp
  trySendPatch({permanents: newPermanents}, now);
}

function applyServerPatch(incoming: {patch: Patch, t: number}) {
  const localTimestamp = lastLocalUpdate.get('permanents') || 0;

  if (incoming.t < localTimestamp) {
    console.debug('[patch] Ignoring stale server patch', {
      server: incoming.t,
      local: localTimestamp
    });
    return;
  }

  // Apply patch
  lastLocalUpdate.set('permanents', incoming.t);
}
```

**Pros:**
- ✅ Handles out-of-order patches
- ✅ Works with concurrent updates
- ✅ Simple logic

**Cons:**
- ⚠️ Requires clock synchronization
- ⚠️ May reject valid server corrections
- ❌ Doesn't reduce network traffic

## Recommended Approach

**Hybrid: Option A + Validation Responses**

1. **Server excludes sender** from `statePatch` broadcasts (Option A)
2. **Server sends validation response** to sender only:
   ```javascript
   // After broadcasting patch to others
   socket.emit('patchAck', {
     accepted: true,
     patchId: computePatchId(patch),
     timestamp: Date.now()
   });

   // Or if rejected
   socket.emit('patchRejected', {
     reason: 'Invalid move',
     patchId: computePatchId(patch),
     correctState: serverAuthorityState
   });
   ```
3. **Client handles rejections** by reverting local state

## Implementation Plan

### Phase 1: Server-Side Fix (Immediate)

**File:** `server/index.js`

**Change 1:** Update patch broadcasting to exclude sender

```javascript
// Find all instances of:
io.to(matchRoom).emit("statePatch", ...)

// Replace with:
socket.to(matchRoom).emit("statePatch", ...)
```

**Change 2:** Add patch acknowledgment

```javascript
// After broadcasting patch
socket.emit('patchAck', {
  accepted: true,
  t: Date.now()
});
```

**Estimated effort:** 1-2 hours
**Risk:** Low (rollback by reverting `socket.to()` to `io.to()`)

### Phase 2: Client-Side Validation Handling (Follow-up)

**File:** `src/components/providers/OnlineProvider.tsx`

**Change:** Handle `patchAck` and `patchRejected` events

```typescript
transport.on('patchAck', (ack) => {
  console.debug('[patch] Server accepted patch', ack);
  // Optional: Clear pending state, show success indicator
});

transport.on('patchRejected', (rejection) => {
  console.error('[patch] Server rejected patch', rejection);
  // Revert to server authority state
  applyServerPatch(rejection.correctState, true);
  // Show error to user
  toast.error(rejection.reason);
});
```

**Estimated effort:** 2-3 hours
**Risk:** Low

### Phase 3: Add Metrics (Optional)

Track patch echo prevention effectiveness:

```javascript
// Server metrics
patchBroadcastsTotal.inc({excluded_sender: true});
patchAcksTotal.inc({accepted: true});
patchRejectionsTotal.inc({reason: rejection.reason});
```

## Testing Strategy

### Unit Tests

```javascript
describe('Patch broadcasting', () => {
  it('should not send statePatch to sender', async () => {
    const senderSocket = await connectClient();
    const receiverSocket = await connectClient();

    await senderSocket.emit('statePatch', {patch: {permanents: {...}}});

    // Sender should NOT receive echo
    expect(senderSocket).not.toHaveReceived('statePatch');

    // Receiver should get broadcast
    expect(receiverSocket).toHaveReceived('statePatch');
  });

  it('should send patchAck to sender', async () => {
    const socket = await connectClient();
    await socket.emit('statePatch', {patch: {permanents: {...}}});

    expect(socket).toHaveReceived('patchAck');
  });
});
```

### Integration Tests

1. **Two players drag permanents simultaneously**
   - Verify: Both moves succeed, no vanishing cards
   - Expected: Each client sees both moves

2. **Player drags permanent onto opponent's permanent**
   - Verify: Cards don't vanish, both remain on board
   - Expected: Moved card appears on target tile

3. **Server rejects invalid move**
   - Verify: Client reverts local state, shows error
   - Expected: User sees rejection reason

## Rollback Plan

If issues arise:

1. **Immediate**: Revert `socket.to()` back to `io.to()` (1 line change)
2. **Remove** `patchAck` emission (remove added code)
3. **Deploy** previous server version from git

## Success Metrics

- ✅ Zero "permanent vanishing" bug reports
- ✅ Patch echo count = 0 (new metric)
- ✅ Patch rejection rate < 0.1% (indicates rare edge cases)
- ✅ No increase in client-server state desync errors

## Related Issues

- **Original bug**: Cards vanish when dragging onto enemy permanents
- **Related spec**: S002-cursor-deduplication (similar echo problem)
- **Dependency**: Requires server access to modify `server/index.js`

## Open Questions

1. **Q:** Should we also deduplicate cursor updates the same way?
   **A:** Yes - covered in S002

2. **Q:** What happens if sender disconnects before receiving `patchAck`?
   **A:** Patch still broadcasts to others; sender rejoins and gets fresh state via resync

3. **Q:** Should we batch patchAck responses?
   **A:** Not initially - adds complexity; revisit if ACKs become bottleneck

## References

- Console logs showing patch echo: (included in problem statement)
- Client patch application: `src/lib/game/store.ts:3988-4019`
- Server broadcast: `server/index.js` (search for `io.to(matchRoom).emit("statePatch")`)
