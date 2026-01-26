# Godot Native Client - Implementation Tasks

## Phase 0: Foundation & Validation (2-3 weeks)

### 0.1 Project Setup

- [ ] 0.1.1 Create new repository `sorcery-godot` (or decide on monorepo structure)
- [ ] 0.1.2 Initialize Godot 4.3+ project with recommended settings
- [ ] 0.1.3 Set up GDScript linting (GDLint or gdtoolkit)
- [ ] 0.1.4 Configure export templates for Windows, macOS, Linux
- [ ] 0.1.5 Set up GitHub Actions for CI (lint, test, build)

### 0.2 Networking Prototype

- [ ] 0.2.1 Implement `SocketIOClient.gd` with WebSocketPeer
- [ ] 0.2.2 Parse Socket.IO protocol (connect, event, ack packets)
- [ ] 0.2.3 Implement reconnection with exponential backoff
- [ ] 0.2.4 Test connection to existing dev server
- [ ] 0.2.5 Implement `hello` and `welcome` handshake
- [ ] 0.2.6 Log all received events to validate protocol compatibility

### 0.3 Basic Board Rendering

- [ ] 0.3.1 Create main game scene with Camera3D and lighting
- [ ] 0.3.2 Import board mesh from existing OBJ/GLTF
- [ ] 0.3.3 Render 4x5 tile grid as placeholder meshes
- [ ] 0.3.4 Load and display a single card texture from CDN
- [ ] 0.3.5 Create `CardInstance3D` component with basic tap/untap

### 0.4 Validation Checkpoint

- [ ] 0.4.1 Successfully connect to dev server from Godot
- [ ] 0.4.2 Receive and log `statePatch` events
- [ ] 0.4.3 Display static board with one card
- [ ] 0.4.4 Document any protocol issues found

---

## Phase 1: Core Gameplay (6-8 weeks)

### 1.1 State Management

- [ ] 1.1.1 Create `GameState.gd` autoload singleton
- [ ] 1.1.2 Implement state structure matching TypeScript types
- [ ] 1.1.3 Implement `apply_patch()` with deep merge
- [ ] 1.1.4 Add signals for zones, permanents, players, phase
- [ ] 1.1.5 Test state sync with real server patches

### 1.2 Transport Layer

- [ ] 1.2.1 Create `GameTransport.gd` interface matching `transport.ts`
- [ ] 1.2.2 Implement `sendAction()` for game actions
- [ ] 1.2.3 Implement `joinLobby()`, `leaveLobby()`, `ready()`
- [ ] 1.2.4 Implement `startMatch()`, `leaveMatch()`
- [ ] 1.2.5 Implement `resync()` for state recovery
- [ ] 1.2.6 Handle disconnection and reconnection gracefully

### 1.3 Board Rendering

- [ ] 1.3.1 Dynamic tile generation based on `board.size`
- [ ] 1.3.2 Render sites on tiles with owner coloring
- [ ] 1.3.3 Render permanents with stacking (z-offset)
- [ ] 1.3.4 Implement tap/untap rotation animation
- [ ] 1.3.5 Implement card hover preview
- [ ] 1.3.6 Implement card selection glow

### 1.4 Hand Rendering

- [ ] 1.4.1 Create `Hand3D.gd` scene for player's hand
- [ ] 1.4.2 Render cards in arc layout
- [ ] 1.4.3 Implement card hover to expand
- [ ] 1.4.4 Implement drag from hand to board
- [ ] 1.4.5 Show opponent's hand as card backs

### 1.5 Pile Rendering

- [ ] 1.5.1 Create `Pile3D.gd` for spellbook, atlas, graveyard
- [ ] 1.5.2 Show pile count badge
- [ ] 1.5.3 Implement click to open pile search dialog
- [ ] 1.5.4 Implement draw from pile (top/bottom)

### 1.6 Avatar Rendering

- [ ] 1.6.1 Render avatars at edge positions
- [ ] 1.6.2 Implement avatar tap for atlas actions
- [ ] 1.6.3 Display avatar counters (Dragonlord champion, etc.)

### 1.7 Game Flow

- [ ] 1.7.1 Implement phase indicator UI
- [ ] 1.7.2 Implement turn indicator and end turn button
- [ ] 1.7.3 Implement mulligan screen
- [ ] 1.7.4 Implement D20 roll for starting player
- [ ] 1.7.5 Implement game end screen (win/loss)

### 1.8 Combat System

- [ ] 1.8.1 Implement combat HUD overlay
- [ ] 1.8.2 Implement attacker selection
- [ ] 1.8.3 Implement target selection (minion, avatar, site)
- [ ] 1.8.4 Implement defender assignment
- [ ] 1.8.5 Display combat resolution summary

### 1.9 Magic System

- [ ] 1.9.1 Implement magic spell placement on board
- [ ] 1.9.2 Implement caster selection (avatar or permanent)
- [ ] 1.9.3 Implement target selection overlays
- [ ] 1.9.4 Implement magic connection lines (like MagicConnectionLines.tsx)

---

## Phase 2: Deck & Collection (4-6 weeks)

### 2.1 Lobby UI

- [ ] 2.1.1 Create lobby browser screen
- [ ] 2.1.2 Display open lobbies list
- [ ] 2.1.3 Implement create lobby dialog
- [ ] 2.1.4 Implement join lobby flow
- [ ] 2.1.5 Implement player ready state toggle
- [ ] 2.1.6 Implement match type selection (constructed, sealed, draft)

### 2.2 Deck Builder

- [ ] 2.2.1 Create deck builder scene
- [ ] 2.2.2 Implement card search and filter
- [ ] 2.2.3 Implement drag-and-drop card addition
- [ ] 2.2.4 Implement deck validation (40 cards, 1 avatar, etc.)
- [ ] 2.2.5 Implement deck save/load via server API
- [ ] 2.2.6 Implement deck import (text format)

### 2.3 Deck Selector

- [ ] 2.3.1 Fetch user's decks from server
- [ ] 2.3.2 Display deck list with avatars
- [ ] 2.3.3 Implement deck selection for match

### 2.4 Sealed Mode

- [ ] 2.4.1 Implement sealed pack opening animation
- [ ] 2.4.2 Implement deck construction from pool
- [ ] 2.4.3 Implement construction timer UI
- [ ] 2.4.4 Implement deck submission

### 2.5 Draft Mode

- [ ] 2.5.1 Implement draft pack display
- [ ] 2.5.2 Implement pick selection and passing
- [ ] 2.5.3 Implement pick timer
- [ ] 2.5.4 Implement deck construction from picks
- [ ] 2.5.5 Sync draft state with server

### 2.6 Collection View

- [ ] 2.6.1 Implement card collection browser
- [ ] 2.6.2 Implement filtering by set, type, rarity
- [ ] 2.6.3 Display card details on hover/click

---

## Phase 3: Polish & Steam (4-6 weeks)

### 3.1 UI Polish

- [ ] 3.1.1 Create consistent UI theme (colors, fonts)
- [ ] 3.1.2 Implement settings menu (graphics, audio, controls)
- [ ] 3.1.3 Implement main menu scene
- [ ] 3.1.4 Add loading screens with progress
- [ ] 3.1.5 Implement toast notifications
- [ ] 3.1.6 Implement chat panel

### 3.2 Audio

- [ ] 3.2.1 Port sound effects from web client
- [ ] 3.2.2 Implement audio manager with volume controls
- [ ] 3.2.3 Add card play, draw, combat sounds
- [ ] 3.2.4 Add ambient/background music (if licensed)

### 3.3 Asset Management

- [ ] 3.3.1 Implement texture cache with LRU eviction
- [ ] 3.3.2 Implement background texture loading
- [ ] 3.3.3 Implement placeholder textures during load
- [ ] 3.3.4 Test KTX2 texture loading performance

### 3.4 Steam Integration

- [ ] 3.4.1 Integrate GodotSteam plugin
- [ ] 3.4.2 Implement Steam authentication
- [ ] 3.4.3 Define achievements in Steamworks dashboard
- [ ] 3.4.4 Implement achievement unlock triggers
- [ ] 3.4.5 Implement cloud save for preferences
- [ ] 3.4.6 Implement Rich Presence (show current activity)
- [ ] 3.4.7 Implement Steam friends integration for invites

### 3.5 Custom Cardbacks

- [ ] 3.5.1 Load user's selected cardback from server
- [ ] 3.5.2 Apply cardback texture to Hand3D and Piles
- [ ] 3.5.3 Display opponent's cardback correctly

### 3.6 Performance Optimization

- [ ] 3.6.1 Profile and optimize render pipeline
- [ ] 3.6.2 Implement LOD for distant cards (if needed)
- [ ] 3.6.3 Optimize state patching for large updates
- [ ] 3.6.4 Test on Steam Deck (720p performance)

---

## Phase 4: Launch (2-4 weeks)

### 4.1 Steam Submission

- [ ] 4.1.1 Apply for Steam App ID
- [ ] 4.1.2 Create store page assets (screenshots, trailer)
- [ ] 4.1.3 Write store description and tags
- [ ] 4.1.4 Submit for Steam review
- [ ] 4.1.5 Address any review feedback

### 4.2 Beta Testing

- [ ] 4.2.1 Create closed beta branch on Steam
- [ ] 4.2.2 Distribute beta keys to testers
- [ ] 4.2.3 Collect and prioritize feedback
- [ ] 4.2.4 Fix critical bugs from beta

### 4.3 Cross-Client Testing

- [ ] 4.3.1 Test web vs Godot match (all phases)
- [ ] 4.3.2 Verify state sync correctness
- [ ] 4.3.3 Test reconnection scenarios
- [ ] 4.3.4 Test draft/sealed with mixed clients

### 4.4 Documentation

- [ ] 4.4.1 Write README for Godot repository
- [ ] 4.4.2 Document build and release process
- [ ] 4.4.3 Create Steam launch checklist

### 4.5 Launch

- [ ] 4.5.1 Set release date on Steam
- [ ] 4.5.2 Coordinate with web client announcement
- [ ] 4.5.3 Monitor launch day metrics
- [ ] 4.5.4 Hotfix any critical issues

---

## Server Changes (Minimal)

### S.1 Protocol Version

- [ ] S.1.1 Add `protocolVersion` to welcome payload
- [ ] S.1.2 Add `clientType` field to hello payload
- [ ] S.1.3 Log client type for analytics

### S.2 Steam Authentication (Optional)

- [ ] S.2.1 Evaluate Steam Web API auth needs
- [ ] S.2.2 Implement Steam ticket verification (if needed)
- [ ] S.2.3 Link Steam ID to existing user accounts

---

## Dependencies & Blockers

| Task   | Blocker                         |
| ------ | ------------------------------- |
| 3.4.\* | Steam App ID approval           |
| 4.1.\* | Curiosa IP licensing for Steam  |
| 2.5.\* | Draft protocol documentation    |
| All    | Developer with Godot experience |

---

## Success Criteria

### Phase 0 Complete When:

- [ ] Godot client connects to dev server
- [ ] Receives and logs state patches
- [ ] Renders static board with card

### Phase 1 Complete When:

- [ ] Full constructed match playable
- [ ] Combat and magic work correctly
- [ ] Cross-play with web client verified

### Phase 2 Complete When:

- [ ] Deck builder functional
- [ ] Sealed and draft modes work
- [ ] User can save and load decks

### Phase 3 Complete When:

- [ ] Steam overlay works
- [ ] Achievements unlock correctly
- [ ] Performance targets met (60 FPS at 1080p)

### Phase 4 Complete When:

- [ ] Steam store page live
- [ ] Beta tested with real users
- [ ] No critical bugs at launch
