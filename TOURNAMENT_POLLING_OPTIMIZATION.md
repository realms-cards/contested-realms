# Tournament Polling Optimization Plan

## Problem Analysis

**Current Issue:**

- Tournament list polling runs every 15 seconds on ALL pages via `RealtimeTournamentContext`
- Polling occurs even when no tournaments exist (empty API responses)
- Polling happens on pages that don't need tournament data
- WebSocket already provides real-time updates, making polling redundant when connected

**Cost Impact:**

- ~240 requests/hour per user (4 requests/minute)
- If 100 concurrent users: 24,000 requests/hour = 576,000 requests/day
- Most of these return empty arrays when no tournaments are active

## Root Cause

Looking at `src/contexts/RealtimeTournamentContext.tsx`:

```typescript
// Line 1095-1108: Polling runs on ALL pages if isOnTournamentPage is true
useEffect(() => {
  if (!isOnTournamentPage) return;
  if (isConnected) return; // Good: skip when WebSocket connected

  const id = setInterval(() => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    )
      return;
    void refreshTournaments(); // Polls /api/tournaments every 15s
  }, 15000);
  return () => clearInterval(id);
}, [isConnected, isOnTournamentPage, refreshTournaments]);
```

**Issues:**

1. `isOnTournamentPage` is too broad - includes `/online/lobby` where tournaments aren't primary
2. No mechanism to detect "no active tournaments" and stop polling
3. No WebSocket event to announce new tournaments, forcing continuous polling

## Solution: Event-Driven Architecture

### 1. WebSocket Tournament Announcement (Recommended)

**Server-side changes:**

- Broadcast `tournament:created` event to all connected clients when tournament is created
- Broadcast `tournament:list-changed` event when tournament status changes to/from active states

**Client-side changes:**

- Listen for tournament announcement events
- Only fetch tournament list when events are received OR when explicitly on `/tournaments` page
- Stop polling entirely when WebSocket is connected

### 2. Route-Based Polling Guards

**Only poll on these specific routes:**

- `/tournaments` - Main tournament list page
- `/tournaments/[id]` - Tournament detail page (but only for that specific tournament)

**Never poll on:**

- `/online/lobby` - Tournaments are secondary here
- `/online/play` - Match is already in progress
- Any other page

### 3. Smart Polling with Backoff

**When WebSocket disconnected:**

- First poll: immediate
- If empty response: backoff to 60s
- If tournaments exist: poll every 30s
- If tournament list unchanged for 5 minutes: stop polling until page refresh

## Implementation Plan

### Phase 1: Add WebSocket Tournament Announcements (High Priority)

**Server changes (`server/index.js` or tournament module):**

```javascript
// When tournament is created
io.emit("tournament:created", {
  id: tournament.id,
  name: tournament.name,
  format: tournament.format,
  status: tournament.status,
  maxPlayers: tournament.maxPlayers,
  currentPlayers: tournament.currentPlayers,
});

// When tournament status changes to active states
io.emit("tournament:list-changed", {
  action: "added" | "removed" | "updated",
  tournamentId: tournament.id,
});
```

**Client changes (`RealtimeTournamentContext.tsx`):**

```typescript
// Listen for tournament announcements
useEffect(() => {
  if (!socket) return;

  const handleTournamentCreated = (data) => {
    console.log("[Tournament] New tournament announced:", data);
    // Fetch fresh tournament list
    refreshTournaments();
  };

  const handleListChanged = (data) => {
    console.log("[Tournament] List changed:", data);
    refreshTournaments();
  };

  socket.on("tournament:created", handleTournamentCreated);
  socket.on("tournament:list-changed", handleListChanged);

  return () => {
    socket.off("tournament:created", handleTournamentCreated);
    socket.off("tournament:list-changed", handleListChanged);
  };
}, [socket, refreshTournaments]);
```

### Phase 2: Implement Route-Based Polling Guards

**Update `isOnTournamentPage` logic:**

```typescript
// Only enable polling on actual tournament pages
const shouldPollTournaments =
  pathname === "/tournaments" || pathname?.startsWith("/tournaments/");

// Remove /online/lobby and /online/play from polling
```

### Phase 3: Smart Polling with Empty Detection

```typescript
const [lastTournamentCount, setLastTournamentCount] = useState(0);
const [emptyResponseCount, setEmptyResponseCount] = useState(0);

const refreshTournaments = useCallback(async () => {
  // ... existing fetch logic ...

  const tournamentsData = await response.json();
  setTournaments(tournamentsData);

  // Track empty responses
  if (tournamentsData.length === 0) {
    setEmptyResponseCount((prev) => prev + 1);
  } else {
    setEmptyResponseCount(0);
  }

  setLastTournamentCount(tournamentsData.length);
}, []);

// Adaptive polling interval
const getPollingInterval = () => {
  if (emptyResponseCount >= 3) return 60000; // 1 minute if consistently empty
  if (lastTournamentCount === 0) return 45000; // 45s if no tournaments
  return 30000; // 30s if tournaments exist
};
```

## Expected Impact

### Before Optimization:

- Polling: Every 15s on 4+ routes
- Requests per user per hour: ~240
- 100 concurrent users: 24,000 requests/hour

### After Optimization:

- Polling: Only when WebSocket disconnected AND on `/tournaments` page
- Event-driven: Fetch only when tournaments are created/changed
- Requests per user per hour: ~5-10 (90-95% reduction)
- 100 concurrent users: 500-1,000 requests/hour

**Cost savings: ~23,000 requests/hour = ~550,000 requests/day**

## Migration Strategy

1. **Phase 1 (Immediate):** Add route guards to stop polling on `/online/lobby` and `/online/play`
2. **Phase 2 (High Priority):** Implement WebSocket tournament announcements
3. **Phase 3 (Nice to have):** Add smart backoff for empty responses

## Testing Checklist

- [ ] Tournament list updates when new tournament is created
- [ ] Tournament detail page receives real-time updates
- [ ] No polling occurs on `/online/lobby` page
- [ ] No polling occurs on `/online/play` page
- [ ] Polling resumes when WebSocket disconnects
- [ ] Empty tournament list doesn't cause excessive polling
- [ ] Tournament announcements work across multiple browser tabs

## Rollback Plan

If issues arise:

1. Revert route guards (restore original `isOnTournamentPage` logic)
2. Keep WebSocket events but re-enable polling as fallback
3. Monitor for missed tournament updates
