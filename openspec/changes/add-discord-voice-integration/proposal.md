# Add Discord Voice Integration

## Why

Players want easy voice communication during matches without leaving the game UI. Discord is the de-facto standard for gaming voice chat, and many players already have linked Discord accounts. Providing a one-click voice channel experience enhances social gameplay.

## What Changes

- **Discord Bot Integration** — A server-side Discord bot that manages temporary voice channels
- **OAuth2 Discord Linking** — Users can link their Discord account (extends existing auth)
- **Voice Channel API** — Endpoints to create/join/leave match voice channels
- **UI Voice Button** — In-game button to join voice chat with presence indicator
- **Spectate URL Sharing** — Bot posts spectate link in the voice channel text chat

## Impact

- **Affected specs**: None existing (new capability)
- **Affected code**:
  - `server/` — New Discord bot module
  - `src/app/api/discord/` — New API routes
  - `src/app/online/play/` — Voice button UI
  - `prisma/schema.prisma` — Discord user ID storage (if not already linked)
  - Environment variables for Discord bot token

## Dependencies

- Discord.js library
- Discord Developer Application with Bot permissions
- `DISCORD_BOT_TOKEN` environment variable
- `DISCORD_GUILD_ID` for the community server

## Non-Goals

- Streaming game video to Discord (complex, low ROI vs spectate URL)
- In-game voice chat without Discord (requires WebRTC infrastructure)
- Mandatory voice chat (always opt-in)
