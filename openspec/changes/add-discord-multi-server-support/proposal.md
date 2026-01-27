## Why

The Discord bot currently supports a single primary server. To grow the player base and enable community servers to host their own Sorcery communities while maintaining a unified matchmaking experience, the bot needs to support multiple Discord servers with a shared global queue.

## What Changes

- **Global command registration**: Switch from guild-specific to application-wide slash commands
- **Multi-guild bot presence**: Bot can be added to any Discord server via OAuth invite
- **Unified queue across servers**: Players from different servers join the same matchmaking pool
- **Cross-server matching**: Two players from different servers can be matched together
- **Voice channel strategy**: Voice channels always created in primary server (simplest approach)
- **Guild membership tracking**: Track which guilds the bot is in for analytics and management
- **Guild-specific settings** (optional): Allow per-guild configuration (enable/disable features)

## Impact

- Affected specs: `discord-bot` (new capability spec)
- Affected code:
  - `discord-bot/src/index.ts` - Command registration, guild tracking
  - `discord-bot/src/commands/*.ts` - No changes needed (already guild-agnostic)
  - `discord-bot/src/services/queue-manager.ts` - Already global (no changes)
  - `discord-bot/src/services/voice-manager.ts` - Minor: ensure primary guild fallback
  - `prisma/schema.prisma` - New `DiscordGuild` model for tracking
  - `src/app/api/bot/guilds/` - New API routes for guild management

## Non-Goals

- Per-guild queues (all servers share one queue)
- Voice channels in non-primary servers
- Guild-specific bot customization (custom prefixes, etc.)
- Automated server discovery or promotion
