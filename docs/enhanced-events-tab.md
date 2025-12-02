# Enhanced Events Tab Implementation

## Overview
The Events tab in OnlineConsole now supports both:
1. **Game Events**: Card plays, attacks, draws, etc. (existing)
2. **Match Events**: Player join/leave, match results, round starts, etc. (NEW)

## Files Modified/Created

### Created
- **`src/hooks/useMatchEvents.ts`**: Hook for tracking match/tournament-level events
  - Provides `addEvent()` to log new events
  - Includes `formatMatchEvent()` for consistent formatting
  - Supports 11 event types with icons and colors

### Modified
- **`src/components/game/OnlineConsole.tsx`**: Enhanced to display both event types
  - Added `matchEvents` prop
  - Combines game + match events chronologically
  - Renders with appropriate icons and colors

## Usage Example

### Basic Setup

```typescript
import { useMatchEvents } from '@/hooks/useMatchEvents';

function YourMatchComponent({ player1Name, player2Name }: Props) {
  const { events: matchEvents, addEvent } = useMatchEvents({
    matchId: 'match-123',
    tournamentId: 'tournament-456'
  });

  // Track player joining
  useEffect(() => {
    if (playerJoined) {
      addEvent('player_joined', `${playerName} joined the match`, {
        playerId: player.id,
        playerName: player.name
      });
    }
  }, [playerJoined]);

  // Pass to OnlineConsole with player names
  return (
    <OnlineConsole
      // ... existing props ...
      matchEvents={matchEvents}
      playerNames={{ p1: player1Name, p2: player2Name }}
    />
  );
}
```

### Complete Integration Example

```typescript
import { useMatchEvents } from '@/hooks/useMatchEvents';
import { useEffect } from 'react';

function TournamentMatchPage({ matchId, tournamentId }: Props) {
  const { events: matchEvents, addEvent } = useMatchEvents({
    matchId,
    tournamentId
  });

  // Track socket events
  useEffect(() => {
    const socket = getSocket();

    socket.on('player:joined', (data) => {
      addEvent('player_joined', `${data.playerName} joined`, {
        playerId: data.playerId,
        playerName: data.playerName
      });
    });

    socket.on('player:left', (data) => {
      addEvent('player_left', `${data.playerName} left the match`, {
        playerId: data.playerId,
        playerName: data.playerName
      });
    });

    socket.on('player:disconnected', (data) => {
      addEvent('player_disconnected', `${data.playerName} disconnected`, {
        playerId: data.playerId,
        playerName: data.playerName
      });
    });

    socket.on('player:reconnected', (data) => {
      addEvent('player_reconnected', `${data.playerName} reconnected`, {
        playerId: data.playerId,
        playerName: data.playerName
      });
    });

    socket.on('match:started', () => {
      addEvent('match_started', 'Match has begun!');
    });

    socket.on('match:ended', (data) => {
      if (data.isDraw) {
        addEvent('match_ended', 'Match ended in a draw', {
          isDraw: true
        });
      } else {
        addEvent('match_ended', `${data.winnerName} won the match!`, {
          winnerId: data.winnerId,
          winnerName: data.winnerName
        });
      }
    });

    socket.on('round:started', (data) => {
      addEvent('round_started', `Round ${data.roundNumber} has begun!`, {
        roundNumber: data.roundNumber
      });
    });

    return () => {
      socket.off('player:joined');
      socket.off('player:left');
      socket.off('player:disconnected');
      socket.off('player:reconnected');
      socket.off('match:started');
      socket.off('match:ended');
      socket.off('round:started');
    };
  }, [addEvent]);

  return (
    <>
      {/* Your game UI */}
      <OnlineConsole
        dragFromHand={dragFromHand}
        chatLog={chatLog}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendChat={sendChat}
        onLeaveMatch={leaveMatch}
        connected={connected}
        myPlayerId={myPlayerId}
        matchEvents={matchEvents} // ← Pass match events here
      />
    </>
  );
}
```

## Event Types

### Player Events
- **`player_joined`**: ✅ Player joined (green)
- **`player_left`**: 👋 Player left (slate)
- **`player_disconnected`**: ⚠️ Player disconnected (yellow)
- **`player_reconnected`**: 🔄 Player reconnected (blue)

### Match Events
- **`match_started`**: 🎮 Match started (cyan)
- **`match_ended`**: 🏆 Match ended (amber) or 🤝 Draw (slate)
- **`game_started`**: ▶️ Game started (blue)
- **`game_ended`**: ⏸️ Game ended (slate)

### Tournament Events
- **`round_started`**: 🔔 Round started (purple)
- **`pairings_announced`**: 📋 Pairings announced (indigo)
- **`tournament_started`**: 🏁 Tournament started (green)
- **`player_eliminated`**: ❌ Player eliminated (red)

## Display Format

Events are displayed chronologically with:
- **Icon**: Visual indicator of event type
- **Color**: Semantic color coding
- **Message**: Human-readable description
- **Metadata**: Additional context (player IDs, round numbers, etc.)
- **Player Names**: Actual names instead of P1/P2 (when provided)

Example output:
```
✅ Alice joined the match
✅ Bob joined the match
🎮 Match has begun!
[T1] • Alice draws Fire to hand
[T1] • Alice plays [p1:Fire] to the board
[T2] • Bob draws Water to hand
[T2] • Bob plays [p2:Water] to the board
[T3] • Alice attacks with Fire
🏆 Alice won the match!
```

**Note**: Game events now show "Alice" and "Bob" instead of "P1" and "P2" when `playerNames` prop is provided.

## Benefits

1. **Better Context**: Players see who's in the match, when they join/leave
2. **Match History**: Complete timeline of match events
3. **Tournament Flow**: Round starts, pairings, eliminations visible
4. **Debugging**: Easier to track connection issues and match state
5. **Unified View**: Game actions + match events in one place
6. **Player Names**: Game events show actual player names instead of "P1"/"P2"

## Future Enhancements

Potential additions:
- Time duration display for events
- Filtering by event type
- Export event log
- Spectator count changes
- Timeout/timer events
- Draft pick notifications (for draft matches)
