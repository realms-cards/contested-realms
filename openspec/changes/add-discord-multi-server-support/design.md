## Context

The Sorcery Discord bot enables matchmaking and challenges for the card game. Currently deployed to a single server, we want to expand to multiple community servers while maintaining a unified player pool for faster queue times.

**Stakeholders**:
- Players: Want quick matches regardless of which server they're in
- Server admins: Want to host Sorcery communities on their servers
- Developers: Need maintainable, scalable architecture

**Constraints**:
- Single bot instance (leader election prevents duplicates)
- Voice channels require bot presence in guild
- Discord rate limits on command registration

## Goals / Non-Goals

**Goals**:
- Support bot in unlimited Discord servers
- Maintain single unified queue across all servers
- Enable cross-server player matching
- Track guild membership for analytics
- Provide clear onboarding for new servers

**Non-Goals**:
- Per-guild queue partitioning
- Voice channels in arbitrary servers
- Guild-specific bot customization
- Automated server promotion/discovery

## Decisions

### Decision 1: Global Command Registration

**What**: Register slash commands globally instead of per-guild.

**Why**:
- Simpler deployment (one registration, works everywhere)
- No need to track guild IDs for command sync
- Automatic availability when bot joins new server

**Trade-off**: Global commands take ~1 hour to propagate vs instant for guild commands. Acceptable since commands rarely change.

**Implementation**:
```typescript
// Before: Guild-specific
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

// After: Global
await rest.put(Routes.applicationCommands(clientId), { body: commands });
```

### Decision 2: Voice Always in Primary Server

**What**: All voice channels created in the primary guild regardless of where players queued.

**Why**:
- Simplest implementation (no cross-guild permission complexity)
- Bot guaranteed to be in primary guild
- Invite URLs work cross-server

**Alternative considered**: Create voice in origin server
- Rejected: Requires bot in both players' servers, complex fallback logic

**Alternative considered**: Let players choose server
- Rejected: Added UX complexity with minimal benefit

### Decision 3: Track Guilds in Database

**What**: Store `DiscordGuild` records when bot joins/leaves servers.

**Why**:
- Analytics on bot reach
- Identify active vs inactive servers
- Enable future per-guild settings
- Admin dashboard for monitoring

**Schema**:
```prisma
model DiscordGuild {
  id              String   @id  // Discord snowflake
  name            String
  memberCount     Int?
  joinedAt        DateTime @default(now())
  leftAt          DateTime?
  isActive        Boolean  @default(true)
  settings        Json?    // Future: per-guild config
  matchesHosted   Int      @default(0)

  @@index([isActive])
  @@index([joinedAt])
}
```

### Decision 4: Queue Remains Global

**What**: Keep the existing single Redis queue key across all servers.

**Why**:
- Already implemented and working
- Maximizes match availability
- Simpler mental model for players

**Key**: `realms:queue:constructed` (unchanged)

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Global commands take 1hr to propagate | New servers wait for commands | Document expected delay, use guild commands for development |
| Voice in primary server feels disconnected | Players must join external voice | Clear messaging in DMs, invite URL provided |
| Bot kicked from primary guild | Voice channels break | Alert monitoring, manual intervention required |
| Rate limits during command registration | Commands fail to register | Retry logic, register once on deploy |

## Migration Plan

**Phase 1: Preparation** (no user impact)
1. Add `DiscordGuild` model and migration
2. Add guild event handlers (join/leave tracking)
3. Test in development environment

**Phase 2: Command Migration**
1. Deploy global command registration
2. Wait 1 hour for propagation
3. Remove old guild-specific commands
4. Verify commands work in test server

**Phase 3: Public Launch**
1. Create public OAuth invite URL
2. Add invite link to website
3. Announce multi-server support
4. Monitor guild joins

**Rollback**:
- Re-register guild-specific commands if issues
- Global commands coexist with guild commands (no conflict)

## Open Questions

1. **Guild onboarding message**: Should the bot send a welcome message when joining a new server? If so, which channel?
   - Proposed: Send to first text channel bot can message, or skip silently

2. **Inactive guild cleanup**: Should we auto-leave guilds with no activity?
   - Proposed: No, let server admins decide. Track last activity for reporting.

3. **Admin dashboard**: Do we need a web UI for guild management?
   - Proposed: Defer to future. API routes sufficient for now.
