# Realms.cards Discord Bot

Discord bot for Realms.cards integration - match invitations, voice channels, and account linking.

## Features

- **Match Challenges**: `/challenge @user [format]` - Challenge players to matches
- **Account Linking**: `/link` - Link Discord account to Realms.cards
- **Status**: `/status` - Check your status and see who's online
- **Voice Channels**: Automatic private voice channels for matches

## Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Enable "Server Members Intent" under Privileged Gateway Intents
6. Go to "OAuth2" → "URL Generator"
7. Select scopes: `bot`, `applications.commands`
8. Select permissions: Send Messages, Embed Links, Use Slash Commands, Manage Channels, Connect, Speak, Move Members
9. Copy the generated URL and invite the bot to your server

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required variables:

- `DISCORD_BOT_TOKEN` - Bot token from Discord Developer Portal
- `DISCORD_CLIENT_ID` - Application ID (same as OAuth client ID)
- `DISCORD_GUILD_ID` - Your server ID (for guild commands - faster updates)
- `REALMS_API_URL` - URL to realms.cards API (e.g., `http://localhost:3001`)
- `REALMS_BOT_SECRET` - Shared secret for bot-API authentication
- `REDIS_URL` - Redis URL for leader election

### 3. Deploy Commands

```bash
npm install
npm run deploy-commands
```

### 4. Run the Bot

**Development:**

```bash
npm run dev
```

**Production (Docker):**

```bash
docker build -t realms-discord-bot .
docker run -d --name realms-bot --env-file .env realms-discord-bot
```

## Architecture

### Single Instance Requirement

**IMPORTANT**: Only ONE bot instance should run at a time. Multiple instances connecting with the same token will cause issues.

The bot uses Redis-based leader election to ensure only one instance runs:

- On startup, attempts to acquire a Redis lock
- If lock is held by another instance, exits gracefully
- Heartbeat keeps the lock alive
- On shutdown, releases the lock

### Services

- **RealmsApiClient**: HTTP client for realms.cards API
- **VoiceChannelManager**: Creates/manages private voice channels
- **ChallengeManager**: Tracks match challenges

## Commands

### `/challenge @opponent [format]`

Challenge another player to a match.

- `opponent` (required): The Discord user to challenge
- `format` (optional): `constructed`, `sealed`, or `draft` (default: constructed)

Both players must have linked accounts. When accepted, both receive DMs with direct match links.

### `/link`

Subcommands:

- `/link start` - Get a link to connect your Discord to Realms.cards
- `/link status` - Check if your account is linked
- `/link unlink` - Disconnect your accounts

### `/status`

Shows your Realms.cards profile and online status.

## Development

```bash
# Install dependencies
npm install

# Run in development (with hot reload)
npm run dev

# Build
npm run build

# Deploy slash commands
npm run deploy-commands

# Lint
npm run lint
```

## Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  discord-bot:
    build: ./discord-bot
    restart: unless-stopped
    deploy:
      replicas: 1 # MUST be 1 - do not scale
    environment:
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
      - DISCORD_GUILD_ID=${DISCORD_GUILD_ID}
      - REALMS_API_URL=http://server:3001
      - REALMS_BOT_SECRET=${REALMS_BOT_SECRET}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - server
```
