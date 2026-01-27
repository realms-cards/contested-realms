## 1. Database Schema

- [ ] 1.1 Add `DiscordGuild` model to track bot guild membership
- [ ] 1.2 Add guild statistics fields (member count, active players, matches hosted)
- [ ] 1.3 Create migration for new schema
- [ ] 1.4 Seed development data for testing

## 2. Command Registration

- [ ] 2.1 Switch from guild-specific to global command registration in `deploy-commands.ts`
- [ ] 2.2 Update `index.ts` to handle global commands
- [ ] 2.3 Remove `DISCORD_GUILD_ID` requirement for command registration
- [ ] 2.4 Add command sync on bot startup (optional, for development)

## 3. Guild Event Handling

- [ ] 3.1 Add `guildCreate` event handler for when bot joins a server
- [ ] 3.2 Add `guildDelete` event handler for when bot leaves/is kicked
- [ ] 3.3 Track guild join/leave in database
- [ ] 3.4 Log guild membership changes for monitoring

## 4. Voice Channel Fallback

- [ ] 4.1 Update `voice-manager.ts` to always use primary guild
- [ ] 4.2 Add clear error messaging when voice creation fails
- [ ] 4.3 Ensure DM fallback works for cross-server matches
- [ ] 4.4 Document voice channel behavior in user-facing help

## 5. API Routes for Guild Management

- [ ] 5.1 Create `GET /api/bot/guilds` - List all guilds bot is in
- [ ] 5.2 Create `GET /api/bot/guilds/[id]` - Get guild details
- [ ] 5.3 Create `GET /api/bot/guilds/stats` - Aggregate statistics
- [ ] 5.4 Add authentication for admin-only routes

## 6. OAuth Invite Flow

- [ ] 6.1 Create public invite URL with required permissions
- [ ] 6.2 Document required bot permissions (Send Messages, Use Slash Commands, Connect, Speak)
- [ ] 6.3 Add invite link to website/documentation
- [ ] 6.4 Create onboarding message for new guilds

## 7. Testing & Validation

- [ ] 7.1 Test command registration across multiple guilds
- [ ] 7.2 Test cross-server queue matching
- [ ] 7.3 Test voice channel creation for cross-server matches
- [ ] 7.4 Test guild join/leave tracking
- [ ] 7.5 Load test with simulated multi-guild traffic

## 8. Documentation

- [ ] 8.1 Update discord-bot README with multi-server setup
- [ ] 8.2 Document OAuth invite process for server admins
- [ ] 8.3 Add FAQ for common multi-server questions
- [ ] 8.4 Update CLAUDE.md with new architecture details
