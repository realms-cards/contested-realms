# Discord Voice Integration — Tasks

## 1. Database & Auth Setup

- [ ] 1.1 Add `discordId` and `discordUsername` fields to User model in `prisma/schema.prisma`
- [ ] 1.2 Add `discordVoiceChannelId` field to OnlineMatchSession model
- [ ] 1.3 Run Prisma migration
- [ ] 1.4 Verify NextAuth Discord provider is configured (or add if missing)
- [ ] 1.5 Add Discord OAuth2 scope for `identify` (minimal, no guilds.join needed)

## 2. Discord Bot Setup

- [ ] 2.1 Create Discord Developer Application and Bot
- [ ] 2.2 Add `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` to env vars
- [ ] 2.3 Create `server/modules/discord/bot.ts` — Discord.js client initialization
- [ ] 2.4 Create `server/modules/discord/voice-channel.ts` — Channel create/delete/invite logic
- [ ] 2.5 Integrate bot startup into `server/index.ts` (lazy load, optional if token missing)
- [ ] 2.6 Add "Match Voice" category creation on bot startup (idempotent)

## 3. API Endpoints

- [ ] 3.1 Create `src/app/api/discord/link/route.ts` — OAuth2 callback to store discordId
- [ ] 3.2 Create `src/app/api/discord/voice-channel/route.ts` — POST to create, GET for status
- [ ] 3.3 Add authentication checks (must be match participant or spectator)
- [ ] 3.4 Implement spectate URL posting when channel is created

## 4. Socket Events

- [ ] 4.1 Add `voiceChannelCreated` event to match room broadcasts
- [ ] 4.2 Add `voicePresenceUpdate` event when members join/leave voice
- [ ] 4.3 Subscribe to Discord voice state updates and relay to match room

## 5. UI Components

- [ ] 5.1 Create `src/components/game/VoiceButton.tsx` — Main voice action button
- [ ] 5.2 Create `src/components/game/VoicePresenceIndicator.tsx` — Member avatars/count
- [ ] 5.3 Integrate VoiceButton into `OnlineStatusBar` or match UI
- [ ] 5.4 Add "Link Discord" prompt if user has no discordId
- [ ] 5.5 Handle `discord://` deep link with web URL fallback

## 6. Channel Lifecycle

- [ ] 6.1 Schedule channel deletion 5 minutes after match ends
- [ ] 6.2 Add cleanup cron/timer for orphaned channels (>1 hour old)
- [ ] 6.3 Post match result summary to channel before deletion
- [ ] 6.4 Handle bot restart — recover channel references from DB

## 7. Testing & Documentation

- [ ] 7.1 Test with Discord desktop app and web
- [ ] 7.2 Test rate limit handling (create multiple matches rapidly)
- [ ] 7.3 Test cleanup after match ends
- [ ] 7.4 Add setup instructions to DEPLOYMENT.md for Discord bot
- [ ] 7.5 Document required Discord permissions for guild admins

## 8. Feature Flag & Rollout

- [ ] 8.1 Add `DISCORD_VOICE_ENABLED` env flag
- [ ] 8.2 Hide voice UI when flag is false or bot token missing
- [ ] 8.3 Enable in staging environment first
- [ ] 8.4 Monitor Discord API rate limit headers in production
