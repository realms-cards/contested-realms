# Discord Voice Integration — Design

## Context

Players currently coordinate voice chat manually through external Discord servers. This creates friction: players must share Discord usernames, create channels, and manage invites outside the game. By integrating Discord directly, we can offer one-click voice joining with automatic cleanup.

**Stakeholders**: Players, tournament organizers, spectators

**Constraints**:

- Must work with users who don't have Discord linked (graceful degradation)
- Channels should be temporary and auto-deleted after match ends
- Bot must have minimal permissions (voice channel management only)
- Rate limits: Discord limits channel creation (~10/min per guild)

## Goals / Non-Goals

**Goals**:

- One-click voice channel joining from match UI
- Automatic channel creation per match
- Voice presence indicator (show who's in voice)
- Spectate URL auto-posted in channel
- Cleanup after match ends

**Non-Goals**:

- Video streaming to Discord
- In-game audio (WebRTC)
- Cross-guild voice (single community server only)
- Mobile Discord deep linking (future enhancement)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Game Client   │────▶│  Socket Server   │────▶│   Discord Bot   │
│                 │     │                  │     │                 │
│ - Voice Button  │     │ - Channel API    │     │ - Create VC     │
│ - Presence UI   │     │ - Presence Sync  │     │ - Post Spectate │
│ - Spectate URL  │     │ - Match Events   │     │ - Cleanup       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │    Database      │
                        │                  │
                        │ - User.discordId │
                        │ - Match.vcId     │
                        └──────────────────┘
```

## Decisions

### D1: Bot runs in Socket.IO server process

**Decision**: Embed Discord.js client in the existing Socket.IO server rather than separate microservice.

**Rationale**:

- Simpler deployment (no additional container)
- Direct access to match state for channel naming/cleanup
- Low Discord API volume doesn't warrant dedicated service

**Alternatives considered**:

- Separate bot service — More isolated but adds deployment complexity
- Serverless functions — Doesn't support persistent WebSocket to Discord

### D2: Single community Discord server

**Decision**: Bot operates in one designated Discord server (guild) only.

**Rationale**:

- Simpler permission model
- Easier moderation
- Voice channels organized in one place

**Future**: Could support user-selected guilds if demand exists.

### D3: Temporary voice channels in a category

**Decision**: Create voice channels under a "Match Voice" category, auto-delete 5 minutes after match ends.

**Rationale**:

- Keeps server organized
- Allows lingering post-match chat
- Category provides visual grouping

### D4: Spectate URL via text chat in voice channel

**Decision**: When a voice channel is created, bot posts the spectate URL as a pinned message.

**Rationale**:

- No complex video streaming
- Spectators can watch in browser while listening to commentary
- Simple to implement

### D5: OAuth2 Discord linking (optional)

**Decision**: Users MAY link Discord via OAuth2. If not linked, voice button shows a prompt to link.

**Rationale**:

- Existing NextAuth supports Discord provider
- Can use Discord ID to set channel permissions per-user
- Non-linked users can still join via invite URL (less seamless)

## Data Model

```prisma
model User {
  // ... existing fields
  discordId       String?   @unique  // Discord snowflake ID
  discordUsername String?            // Cached for display
}

model OnlineMatchSession {
  // ... existing fields
  discordVoiceChannelId String?      // Snowflake ID of voice channel
}
```

## API Endpoints

### POST /api/discord/voice-channel

Creates or retrieves voice channel for a match.

**Request**:

```json
{ "matchId": "abc123" }
```

**Response**:

```json
{
  "channelId": "1234567890",
  "inviteUrl": "https://discord.gg/xyz",
  "inVoice": ["user1", "user2"]
}
```

### DELETE /api/discord/voice-channel

Manually leaves/cleans up voice channel (optional, auto-cleanup preferred).

### GET /api/discord/voice-status

Returns current voice channel status for a match.

**Response**:

```json
{
  "active": true,
  "channelId": "1234567890",
  "members": [
    { "discordId": "111", "displayName": "Player1", "isPlayer": true },
    { "discordId": "222", "displayName": "Spectator", "isPlayer": false }
  ]
}
```

## Discord Bot Permissions

Required permissions (invite URL generator):

- `MANAGE_CHANNELS` — Create/delete voice channels
- `CONNECT` — Bot needs to see channel members
- `SEND_MESSAGES` — Post spectate URL
- `MANAGE_MESSAGES` — Pin spectate message

**Permission integer**: 1049616 (minimal set)

## UI Components

### VoiceButton (in OnlineStatusBar or similar)

```tsx
// States:
// 1. Not linked: "Link Discord" button
// 2. Linked, no channel: "Start Voice" button
// 3. Channel active, not in voice: "Join Voice" button + member count
// 4. In voice: "In Voice ✓" indicator + member avatars
```

### VoicePresenceIndicator

Small indicator showing voice channel members (Discord avatars if available).

## Event Flow

1. **Match starts** — No voice channel yet (on-demand creation)
2. **Player clicks "Start Voice"** →
   - Client calls `POST /api/discord/voice-channel`
   - Server creates channel via Discord API
   - Server stores `discordVoiceChannelId` on match
   - Server posts spectate URL to channel
   - Returns invite URL
3. **Client receives invite URL** →
   - Opens `discord://` protocol URL (desktop app) or fallback to web URL
   - Shows presence indicator
4. **Other player sees voice active** →
   - UI shows "Join Voice" with member count
   - Can click to join same channel
5. **Match ends** →
   - Server schedules channel deletion (5 min delay)
   - Posts "Match ended" message with final result

## Risks / Trade-offs

| Risk                       | Mitigation                                                       |
| -------------------------- | ---------------------------------------------------------------- |
| Discord rate limits        | Queue channel creation, reuse existing channels if match rejoins |
| Bot goes offline           | Graceful degradation — voice button hidden, no crash             |
| User not in Discord server | Invite URL includes server invite if needed                      |
| Channel cleanup fails      | Cron job to clean orphaned channels older than 1 hour            |

## Migration Plan

1. **Phase 1**: Add `discordId` field to User model (optional field, no migration needed)
2. **Phase 2**: Deploy Discord bot with env vars, test in staging guild
3. **Phase 3**: Add UI components behind feature flag
4. **Phase 4**: Enable for all users, monitor rate limits

## Open Questions

1. Should spectators be able to create voice channels, or only players?
2. Should voice channels be private (players only) or public (anyone can join)?
3. Do we want push-to-talk defaults or let Discord handle it?
4. Should we support multiple Discord guilds for different communities?
