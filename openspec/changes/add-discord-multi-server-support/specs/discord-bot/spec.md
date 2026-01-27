## ADDED Requirements

### Requirement: Multi-Server Bot Presence

The Discord bot SHALL support being added to multiple Discord servers simultaneously while maintaining a single bot instance.

#### Scenario: Bot joins new server
- **GIVEN** the bot is running and connected to Discord
- **WHEN** a server admin adds the bot via OAuth invite
- **THEN** the bot receives the `guildCreate` event
- **AND** a `DiscordGuild` record is created in the database
- **AND** slash commands are available in the new server

#### Scenario: Bot removed from server
- **GIVEN** the bot is a member of a Discord server
- **WHEN** the bot is kicked or the server is deleted
- **THEN** the bot receives the `guildDelete` event
- **AND** the `DiscordGuild` record is marked as inactive (`isActive = false`, `leftAt` set)

### Requirement: Global Slash Commands

The Discord bot SHALL register slash commands globally so they are available in all servers the bot joins.

#### Scenario: Commands available after joining
- **GIVEN** the bot has registered global commands
- **WHEN** a server admin adds the bot to their server
- **THEN** all slash commands (`/queue`, `/challenge`, `/link`, `/status`) are available
- **AND** commands work identically to the primary server

#### Scenario: Command registration on deploy
- **GIVEN** a new version of the bot is deployed
- **WHEN** the deploy script runs `npm run deploy-commands`
- **THEN** commands are registered globally via Discord API
- **AND** commands propagate to all servers within 1 hour

### Requirement: Unified Global Queue

The Discord bot SHALL maintain a single matchmaking queue shared across all servers.

#### Scenario: Cross-server queue join
- **GIVEN** Player A is in Server 1 and Player B is in Server 2
- **WHEN** both players use `/queue join`
- **THEN** both are added to the same global queue
- **AND** queue position reflects their place among all queued players

#### Scenario: Cross-server match
- **GIVEN** Player A (Server 1) and Player B (Server 2) are both in the queue
- **WHEN** the queue manager checks for matches
- **THEN** the players are matched regardless of their server origin
- **AND** both receive DM notifications with the match link

### Requirement: Voice Channel in Primary Server

The Discord bot SHALL create voice channels exclusively in the primary server for all matches, regardless of where players queued.

#### Scenario: Voice channel for cross-server match
- **GIVEN** Player A (Server 1) matches with Player B (Server 2)
- **WHEN** a match is created
- **THEN** a voice channel is created in the primary server
- **AND** both players receive a voice channel invite URL via DM
- **AND** the invite works for players not in the primary server

#### Scenario: Voice channel creation failure
- **GIVEN** the bot cannot create a voice channel (permissions, rate limit, etc.)
- **WHEN** a match is created
- **THEN** the match proceeds without voice
- **AND** players are notified that voice is unavailable
- **AND** the match link is still sent via DM

### Requirement: Guild Membership Tracking

The Discord bot SHALL track all guilds it is a member of for analytics and management purposes.

#### Scenario: Guild statistics collection
- **GIVEN** the bot is a member of multiple servers
- **WHEN** an admin queries the guild management API
- **THEN** statistics are returned including:
  - Total guilds (active and inactive)
  - Total combined member count
  - Matches hosted per guild
  - Join/leave history

#### Scenario: Guild activity tracking
- **GIVEN** a player uses a bot command in a guild
- **WHEN** the command is executed
- **THEN** the guild's `lastActivityAt` timestamp is updated
- **AND** command usage counts are incremented

### Requirement: OAuth Invite Flow

The Discord bot SHALL provide a public OAuth invite URL for server admins to add the bot.

#### Scenario: Server admin adds bot
- **GIVEN** a server admin wants to add the bot
- **WHEN** they visit the OAuth invite URL
- **THEN** Discord prompts for server selection
- **AND** required permissions are clearly listed:
  - Send Messages
  - Use Slash Commands
  - Connect (voice)
  - Speak (voice)
- **AND** upon authorization, the bot joins the selected server

#### Scenario: Insufficient permissions
- **GIVEN** a server admin authorizes the bot
- **WHEN** they don't grant all required permissions
- **THEN** the bot joins with reduced functionality
- **AND** commands that require missing permissions fail gracefully with helpful error messages
