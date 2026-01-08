# Discord Bot Integration Strategy for Realms.cards

## Overview

This document outlines a three-phase strategy to integrate a Discord bot with realms.cards, enabling:

1. **Match Invitations** - Players invite each other via Discord, get direct match links
2. **Discord Voice Toggle** - Switch between WebRTC and Discord voice channels
3. **Account Linking** - Connect existing accounts to Discord without losing progress

---

## Architecture Overview

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   Discord Server    │     │    Discord Bot       │     │   Realms.cards      │
│                     │     │  (Node.js service)   │     │                     │
│  - Text channels    │◄───►│  - Slash commands    │◄───►│  - Socket.IO server │
│  - Voice channels   │     │  - Event handlers    │     │  - Next.js API      │
│  - Users            │     │  - OAuth flows       │     │  - PostgreSQL       │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

### Key Components

| Component     | Technology                 | Purpose                                |
| ------------- | -------------------------- | -------------------------------------- |
| Discord Bot   | discord.js v14             | Handle slash commands, manage voice    |
| Bot API       | Express/Fastify            | Internal API for realms.cards ↔ bot    |
| Database      | Existing Prisma/PostgreSQL | Store Discord link tokens, preferences |
| Socket Bridge | Socket.IO client           | Real-time sync with game server        |

---

## Phase 1: Match Invitations

### User Flow

1. **Player A** types `/challenge @PlayerB constructed` in Discord
2. Bot checks if both players have linked accounts
3. Bot creates a pending challenge and sends an embed to **Player B**
4. **Player B** clicks "Accept" button
5. Bot creates a private lobby via realms.cards API
6. Both players receive DM with direct match link: `https://realms.cards/online/play/{matchId}?token={joinToken}`
7. Clicking the link auto-joins the match (no lobby UI needed)

### Slash Commands

```
/challenge @user [format]    - Challenge a player (constructed/sealed/draft)
/challenge cancel            - Cancel pending challenge
/accept                      - Accept most recent challenge
/decline                     - Decline challenge
/status                      - Show your online status and active matches
/link                        - Link Discord account to realms.cards
/unlink                      - Unlink accounts
```

### Database Changes

```prisma
model User {
  // ... existing fields
  discordId           String?   @unique
  discordUsername     String?
  discordLinkedAt     DateTime?
  discordVoiceEnabled Boolean   @default(true)
}

model DiscordChallenge {
  id            String   @id @default(cuid())
  challengerId  String   // realms.cards user ID
  challengeeId  String   // realms.cards user ID
  format        String   // constructed, sealed, draft
  status        String   // pending, accepted, declined, expired, completed
  matchId       String?  // Created when accepted
  lobbyId       String?
  guildId       String   // Discord server ID
  channelId     String   // Where challenge was issued
  messageId     String?  // The challenge embed message
  createdAt     DateTime @default(now())
  expiresAt     DateTime // 5 minutes from creation

  challenger    User     @relation("ChallengerUser", fields: [challengerId], references: [id])
  challengee    User     @relation("ChallengeeUser", fields: [challengeeId], references: [id])

  @@index([challengerId])
  @@index([challengeeId])
  @@index([status, expiresAt])
}
```

### Bot → Realms.cards API

New endpoints the bot will call:

```typescript
// Create a direct match between two players
POST /api/bot/matches
{
  player1Id: string,
  player2Id: string,
  format: "constructed" | "sealed" | "draft",
  challengeId: string  // For tracking
}
→ { matchId, joinTokenP1, joinTokenP2 }

// Validate join token and auto-seat player
GET /api/matches/{matchId}/join?token={joinToken}
→ Redirects to match page with auto-join

// Get user by Discord ID
GET /api/bot/users/by-discord/{discordId}
→ { userId, name, avatar, online }
```

### Security

- Bot API authenticated via shared secret (`DISCORD_BOT_SECRET`)
- Join tokens are short-lived (15 minutes), single-use JWTs
- Rate limiting: 5 challenges per player per hour

---

## Phase 2: Discord Voice Integration

### Approach

Rather than replacing WebRTC, provide a **toggle** that:

- Moves both players to a temporary Discord voice channel
- Mutes in-game WebRTC when Discord voice is active
- Creates ephemeral voice channels that auto-delete when empty

### User Flow

1. Match starts with WebRTC (current behavior)
2. Either player clicks "Switch to Discord Voice" in-game
3. Bot creates temp voice channel: `Match: PlayerA vs PlayerB`
4. Both players receive invite link/notification
5. Players join Discord voice manually (or via Discord's "Join" button)
6. In-game WebRTC automatically mutes
7. When match ends, voice channel is deleted after 30s if empty

### Implementation

```typescript
// Client-side: VoiceToggle component
type VoiceMode = "webrtc" | "discord" | "none";

// Server emits when Discord voice is requested
socket.emit("discord:voice:request", { matchId });

// Bot creates channel and sends invite
socket.on("discord:voice:ready", {
  channelId,
  inviteUrl,
  channelName,
});
```

### Bot Voice Channel Management

```typescript
// discord-bot/voice-manager.ts
class VoiceChannelManager {
  private activeChannels: Map<string, VoiceChannel> = new Map();

  async createMatchChannel(matchId: string, player1: User, player2: User) {
    const guild = await this.getGuild();
    const category = await this.getOrCreateCategory("Active Matches");

    const channel = await guild.channels.create({
      name: `${player1.name} vs ${player2.name}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      userLimit: 2,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.Connect] },
        { id: player1.discordId, allow: [PermissionFlagsBits.Connect] },
        { id: player2.discordId, allow: [PermissionFlagsBits.Connect] },
      ],
    });

    this.activeChannels.set(matchId, channel);
    this.scheduleCleanup(matchId, channel);

    return channel;
  }
}
```

### Considerations

- **Discord permissions needed**: `MANAGE_CHANNELS`, `MOVE_MEMBERS`, `CONNECT`
- **Fallback**: If bot can't create channels, show message to manually join a voice channel
- **Spectators**: Option to allow spectators in voice (configurable per match)

---

## Phase 3: Account Linking

### Linking Methods

#### Method A: OAuth Flow (Recommended)

For users who already have a realms.cards account via email/passkey:

1. User runs `/link` in Discord
2. Bot DMs a unique link: `https://realms.cards/auth/link-discord?token={linkToken}`
3. User clicks link, signs into realms.cards (if not already)
4. After auth, Discord account is linked
5. Bot confirms in DM: "✓ Linked to realms.cards as {username}"

#### Method B: In-App Linking

For users browsing realms.cards who want to add Discord:

1. User goes to Settings → Linked Accounts
2. Clicks "Link Discord"
3. OAuth flow with Discord
4. On callback, links accounts

### Database: LinkToken

```prisma
model AccountLinkToken {
  id          String   @id @default(cuid())
  token       String   @unique
  discordId   String
  discordTag  String   // e.g., "username#1234" or new username format
  guildId     String   // Which server they initiated from
  userId      String?  // Null until linked
  status      String   // pending, completed, expired
  createdAt   DateTime @default(now())
  expiresAt   DateTime // 15 minutes
  completedAt DateTime?

  user        User?    @relation(fields: [userId], references: [id])

  @@index([token])
  @@index([discordId])
}
```

### Merge Strategy

When linking accounts, handle data conflicts:

| Data Type     | Strategy                                           |
| ------------- | -------------------------------------------------- |
| Decks         | Merge (keep all decks from both accounts)          |
| Match History | Merge                                              |
| Collection    | Merge (deduplicate)                                |
| Display Name  | Keep existing realms.cards name (can change later) |
| Avatar        | Keep existing (can change later)                   |
| Patron Status | Keep highest tier                                  |

### Edge Cases

1. **Discord already linked to another account**: Error, must unlink first
2. **Email matches existing account**: Auto-merge suggestion
3. **Multiple Discord accounts**: Only one can be linked at a time

---

## Implementation Phases

### Phase 1A: Foundation (Week 1-2)

- [ ] Set up discord.js bot project
- [ ] Add Discord-related fields to User model
- [ ] Create bot authentication middleware
- [ ] Implement `/link` and `/unlink` commands
- [ ] Build account linking flow

### Phase 1B: Match Invitations (Week 2-3)

- [ ] Add DiscordChallenge model
- [ ] Implement `/challenge` command
- [ ] Create challenge embed with Accept/Decline buttons
- [ ] Build bot API endpoints for match creation
- [ ] Add join token system
- [ ] Test end-to-end flow

### Phase 2: Voice Integration (Week 4-5)

- [ ] Add voice channel management to bot
- [ ] Create VoiceToggle UI component
- [ ] Implement voice state sync between services
- [ ] Add channel cleanup logic
- [ ] Test with real users

### Phase 3: Polish & Extras (Week 6)

- [ ] Add `/status` command showing online players
- [ ] Leaderboard integration (`/leaderboard`)
- [ ] Tournament announcements
- [ ] Match result notifications

---

## Environment Variables

```bash
# Discord Bot
DISCORD_BOT_TOKEN=           # Bot token from Discord Developer Portal
DISCORD_CLIENT_ID=           # Existing OAuth client ID
DISCORD_CLIENT_SECRET=       # Existing OAuth client secret
DISCORD_GUILD_ID=            # Your server ID (for guild commands)
DISCORD_BOT_SECRET=          # Shared secret for bot ↔ API auth

# Feature Flags
DISCORD_BOT_ENABLED=true
DISCORD_VOICE_ENABLED=true
DISCORD_CHALLENGES_ENABLED=true
```

---

## Discord Bot Project Structure

```
discord-bot/
├── src/
│   ├── index.ts              # Entry point
│   ├── client.ts             # Discord.js client setup
│   ├── commands/
│   │   ├── challenge.ts      # /challenge command
│   │   ├── link.ts           # /link command
│   │   ├── status.ts         # /status command
│   │   └── index.ts          # Command registry
│   ├── events/
│   │   ├── interactionCreate.ts
│   │   ├── voiceStateUpdate.ts
│   │   └── ready.ts
│   ├── services/
│   │   ├── realms-api.ts     # API client for realms.cards
│   │   ├── voice-manager.ts  # Voice channel management
│   │   └── challenge-manager.ts
│   ├── utils/
│   │   └── embeds.ts         # Discord embed builders
│   └── types/
│       └── index.ts
├── prisma/                   # Shared with main app or separate
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Discord Bot Permissions

Required bot permissions (integer: `309238025280`):

- Send Messages
- Send Messages in Threads
- Embed Links
- Use Slash Commands
- Manage Channels (for voice)
- Move Members (for voice)
- Connect (for voice)
- Speak (for voice)

OAuth2 scopes: `bot`, `applications.commands`

---

## API Security

### Bot → API Authentication

```typescript
// Middleware for bot API routes
export function botAuth(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers["x-bot-secret"];
  if (secret !== process.env.DISCORD_BOT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
```

### Join Token Structure

```typescript
// JWT payload for match join tokens
interface JoinTokenPayload {
  matchId: string;
  playerId: string;
  seat: "p1" | "p2";
  exp: number; // 15 minutes
  iat: number;
}
```

---

## Monitoring & Observability

- **Metrics**: Challenge created/accepted/declined rates, voice channel usage
- **Logging**: All bot commands logged with user ID, timestamp
- **Alerts**: Bot disconnect, API errors, voice channel creation failures

---

## Next Steps

1. **Create Discord Application**: Set up bot in Discord Developer Portal
2. **Invite to Server**: Add bot to your fresh Discord server
3. **Scaffold Bot Project**: Initialize discord.js project
4. **Database Migration**: Add new models
5. **Implement MVP**: Start with `/link` and `/challenge`

Would you like me to start implementing any of these phases?
