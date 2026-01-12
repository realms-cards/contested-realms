# Discord Voice Integration

Automatic Discord voice channel creation for online matches between Discord-linked players.

## Overview

When two players with linked Discord accounts start a match via the `/challenge` command, the bot automatically creates a private voice channel for them. The channel is cleaned up when the match ends or when both players leave.

## Architecture

### Components

1. **Discord Bot** (`discord-bot/`)

   - `VoiceChannelManager` - Creates and manages Discord voice channels
   - `VoiceCoordinator` - Coordinates with Realms API to get player info
   - `voiceStateUpdate` event handler - Tracks when players join/leave voice

2. **API Endpoints** (`src/app/api/bot/voice/`)

   - `POST /api/bot/voice/create` - Get player Discord IDs for voice channel creation
   - `POST /api/bot/voice/delete` - Notify API when voice channel is deleted

3. **UI Components** (`src/components/game/`)
   - `DiscordVoiceIndicator` - Shows voice channel status in matches (placeholder)

## Flow

### Match Creation

1. Player uses `/challenge @opponent` in Discord
2. Opponent accepts the challenge
3. Bot calls `voiceCoordinator.requestVoiceChannel(matchId, player1Id, player2Id)`
4. Coordinator fetches Discord IDs from API (`/api/bot/voice/create`)
5. VoiceManager creates private voice channel with permissions for both players
6. Bot sends voice invite URL to both players via DM and in the challenge embed

### Voice Channel Properties

- **Category**: "Realms Matches" (auto-created if doesn't exist)
- **Name**: "Player1 vs Player2"
- **User Limit**: 2
- **Permissions**: Only the two players can see and join
- **Invite**: 1 hour expiry, unlimited uses

### Cleanup

- **Empty Channel**: Deleted 30 seconds after both players leave
- **Match End**: Deleted when match ends (future implementation)
- **Bot Shutdown**: All channels cleaned up gracefully

## Requirements

### For Voice to Work

- Both players must have Discord accounts linked to Realms.cards
- Bot must have permissions in the Discord server:
  - `Manage Channels`
  - `View Channels`
  - `Connect`
  - `Speak`

### Environment Variables

```bash
DISCORD_BOT_TOKEN=<bot token>
DISCORD_CLIENT_ID=<application id>
DISCORD_GUILD_ID=<server id>
REALMS_BOT_SECRET=<shared secret>
REALMS_API_URL=https://realms.cards
```

## Implementation Status

### ✅ Completed

- Voice channel creation on challenge accept
- Private voice channels with player permissions
- Voice state tracking and empty channel cleanup
- API endpoints for player info lookup
- Bot graceful shutdown with channel cleanup
- Voice invite URLs sent to players

### 🚧 Future Enhancements

- Match end triggers voice channel deletion
- UI indicator in online match view
- Voice status in match metadata
- Reconnection handling if bot restarts
- Support for spectators (optional 3rd+ slots)
- Voice activity indicators in game UI

## Testing

### Manual Test Flow

1. Link two Discord accounts to Realms.cards via `/link start`
2. Use `/challenge @opponent` in Discord
3. Accept the challenge
4. Verify voice channel appears in "Realms Matches" category
5. Join the voice channel from the invite link
6. Start the match on Realms.cards
7. Leave voice channel - verify it's deleted after 30s

### Bot Logs

```
[voice] Created channel 1234567890 for match discord-abc123
[voice] Channel 1234567890 is empty, scheduling cleanup...
[voice] Deleted channel for match discord-abc123
```

## Error Handling

### Players Not Linked

If one or both players don't have Discord linked:

- Voice channel creation is skipped silently
- Match still proceeds normally
- No error shown to players

### Bot Permissions

If bot lacks permissions:

- Error logged: `Failed to create voice channel`
- Match proceeds without voice
- Players can use external voice chat

### API Errors

If API is unreachable:

- Voice creation skipped
- Match proceeds normally
- Logged: `Voice channel creation skipped: <error>`

## Security

- Voice channels are **private** - only the two players can see/join
- Channels are in a dedicated category with default deny permissions
- Invites expire after 1 hour
- Channels auto-delete when empty to prevent clutter
- Bot uses authenticated API calls with shared secret

## Future: Match End Integration

To trigger voice cleanup on match end, the Socket.IO server should:

```typescript
// In match end handler
if (matchId.startsWith("discord-")) {
  // Notify bot to cleanup voice channel
  await fetch(`${process.env.REALMS_API_URL}/api/bot/voice/delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.REALMS_BOT_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ matchId }),
  });
}
```

The bot will then delete the voice channel immediately instead of waiting for it to be empty.
