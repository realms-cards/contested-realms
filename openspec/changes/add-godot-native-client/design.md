# Godot Native Client - Technical Design

## Context

Contested Realms currently runs as a Next.js web application with Three.js/React Three Fiber for 3D rendering. The backend is a Node.js Socket.IO server with PostgreSQL and Redis. This design document covers the technical architecture for a parallel Godot 4.x native client targeting Steam release.

**Stakeholders:**

- Development team (capacity planning)
- Curiosa (IP licensing for Steam)
- Players (cross-play expectations)

**Constraints:**

- Must maintain cross-play with existing web client
- Cannot break existing server protocol
- Limited development resources

---

## Goals / Non-Goals

### Goals

1. Create a standalone Godot 4.x client for Steam distribution
2. Achieve feature parity with web client for core gameplay
3. Integrate Steamworks (achievements, friends, cloud saves)
4. Enable cross-play between web and Steam clients
5. Share server infrastructure (no separate Steam servers)

### Non-Goals

1. Replace the web client (both will coexist)
2. Rewrite the server in a new language
3. Create mobile apps (future scope)
4. Support offline-only gameplay (server-authoritative)

---

## Architecture Decisions

### Decision 1: Separate Repository

**Choice:** Create `sorcery-godot` as a separate repository

**Rationale:**

- Godot project structure differs significantly from Next.js
- Separate CI/CD pipelines (GitHub Actions for Steam uploads)
- Independent versioning and release cycles
- Avoids monorepo complexity with different toolchains

**Alternatives considered:**

- Monorepo subfolder: Rejected due to toolchain conflicts
- Same repo with Godot branch: Rejected due to merge complexity

---

### Decision 2: GDScript as Primary Language

**Choice:** Use GDScript for most code, C# for performance-critical sections

**Rationale:**

- GDScript is tightly integrated with Godot editor
- Python-like syntax familiar to JS developers
- C# available for state machine or networking if needed
- Avoid C++ GDExtension complexity initially

**Alternatives considered:**

- C# only: Rejected due to weaker editor integration
- C++ GDExtension: Rejected due to complexity overhead

---

### Decision 3: Socket.IO via WebSocketPeer + Custom Parser

**Choice:** Implement Socket.IO protocol parsing in GDScript over WebSocketPeer

**Rationale:**

- Socket.IO is essentially WebSocket + message framing
- Godot's WebSocketPeer is reliable and well-documented
- Custom parser gives full control over reconnection logic
- Avoid third-party dependencies that may break

**Protocol mapping:**

```gdscript
# Socket.IO packet types
enum PacketType { CONNECT = 0, DISCONNECT = 1, EVENT = 2, ACK = 3 }

# Parse incoming: "42["statePatch",{...}]"
func _parse_message(raw: String) -> Dictionary:
    if raw.begins_with("42"):
        var json = JSON.parse_string(raw.substr(2))
        return { "event": json[0], "data": json[1] }
    return {}
```

**Alternatives considered:**

- HTTP long-polling: Rejected due to latency
- Raw WebSocket (non-Socket.IO): Would require server changes
- Third-party Godot Socket.IO addon: Unreliable maintenance

---

### Decision 4: State Management Pattern

**Choice:** Centralized autoload singleton with signals

**Rationale:**

- Mirrors Zustand pattern from web client
- Autoloads are globally accessible like React context
- Signals provide reactive updates without polling
- Easy to serialize for debugging

```gdscript
# game_state.gd (autoload)
extends Node

signal zones_updated(seat: String, zones: Dictionary)
signal permanents_updated(permanents: Dictionary)
signal phase_changed(phase: String)

var zones: Dictionary = { "p1": {}, "p2": {} }
var permanents: Dictionary = {}
var phase: String = "Setup"

func apply_patch(patch: Dictionary) -> void:
    if patch.has("zones"):
        zones.merge(patch.zones, true)
        zones_updated.emit(patch.get("__seat", ""), zones)
    # ... etc
```

**Alternatives considered:**

- Per-node state: Rejected due to sync complexity
- Redux-style reducer pattern: Overkill for GDScript

---

### Decision 5: 3D Rendering Approach

**Choice:** Hybrid 2D/3D with 3D board and 2D card textures on MeshInstance3D

**Rationale:**

- Cards are essentially textured planes (like current CardPlane.tsx)
- Board and table can be true 3D for camera angles
- Godot's 3D import supports current OBJ/GLTF models
- StandardMaterial3D replicates PBR from Three.js

**Scene hierarchy:**

```
GameScene (Node3D)
├── Camera3D
├── DirectionalLight3D
├── Board (Node3D)
│   ├── Tiles[20] (MeshInstance3D each)
│   └── Sites (dynamically instanced)
├── Avatars (Node3D)
│   ├── P1Avatar (CardInstance3D)
│   └── P2Avatar (CardInstance3D)
├── Hand (Node3D)
│   └── Cards[] (CardInstance3D)
└── Piles (Node3D)
    ├── Spellbook, Atlas, Graveyard
```

**Alternatives considered:**

- Pure 2D: Rejected, loses 3D board presence
- Full 3D cards: Overkill, textures are sufficient

---

### Decision 6: Steam Integration via GodotSteam

**Choice:** Use GodotSteam plugin (maintained, MIT license)

**Rationale:**

- Official Valve Steamworks SDK bindings for Godot
- Active maintenance, supports Godot 4.x
- Covers achievements, friends, cloud saves, overlay
- Well-documented with examples

**Integration points:**
| Feature | Implementation |
|---------|----------------|
| Auth | Steam ID passed in `hello` payload |
| Achievements | Unlock on match win, first draft, etc. |
| Friends | Steam friends list for lobby invites |
| Cloud saves | Deck lists, preferences |
| Rich presence | "In Match vs [opponent]" |

**Alternatives considered:**

- Direct Steamworks via GDExtension: Too much work
- No Steam integration: Defeats purpose of Steam release

---

### Decision 7: Asset Pipeline

**Choice:** Reuse existing CDN assets, add Godot-specific import settings

**Rationale:**

- Card textures (PNG/WebP) work directly
- KTX2 Basis Universal supported in Godot 4
- 3D models (OBJ) already in `public/3dmodels/`
- Avoid duplicating 1000+ card textures

**Asset flow:**

```
CDN (Cloudflare/DO Spaces)
    ├── data-webp/  → Godot loads via HTTPRequest
    ├── data-ktx2/  → GPU compressed textures
    └── 3dmodels/   → Download on first run
                         ↓
              Godot resource cache
                 (user://cache/)
```

**Alternatives considered:**

- Bundle all assets in PCK: 2GB+ download, rejected
- Separate asset CDN for Godot: Unnecessary duplication

---

## Component Architecture

### Transport Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    SocketIOClient.gd                         │
├─────────────────────────────────────────────────────────────┤
│ - WebSocketPeer connection                                  │
│ - Socket.IO protocol parsing                                │
│ - Reconnection with exponential backoff                     │
│ - Event emission via signals                                │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      GameTransport.gd   LobbyClient.gd   ChatClient.gd
      (match state)      (lobby state)    (chat messages)
```

### Game State

```
┌─────────────────────────────────────────────────────────────┐
│                    GameState.gd (Autoload)                   │
├─────────────────────────────────────────────────────────────┤
│ Mirrors Zustand store structure:                            │
│ - zones: Dictionary (p1/p2 → spellbook, atlas, hand, etc.) │
│ - permanents: Dictionary (cellKey → PermanentItem[])        │
│ - board: Dictionary (size, sites)                           │
│ - players: Dictionary (p1/p2 → life, mana, thresholds)     │
│ - phase: String                                             │
│ - turn: int                                                 │
│                                                             │
│ Methods:                                                    │
│ - apply_patch(patch: Dictionary)                            │
│ - get_player_state(seat: String) → Dictionary               │
│ - get_permanent_at(cell: String, index: int) → Dictionary  │
└─────────────────────────────────────────────────────────────┘
```

### 3D Scene Components

```gdscript
# CardInstance3D.gd - Reusable card component
class_name CardInstance3D extends Node3D

@export var card_id: int
@export var variant_slug: String
@export var is_tapped: bool = false
@export var is_face_down: bool = false

var _mesh: MeshInstance3D
var _material: StandardMaterial3D

func _ready():
    _mesh = $CardMesh
    _load_texture()

func _load_texture():
    var url = AssetManager.get_card_url(variant_slug)
    var texture = await AssetManager.load_texture(url)
    _material.albedo_texture = texture
```

---

## Data Flow

### Match Join Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Godot Client │    │   Server     │    │ Web Client   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       │ hello(steamId,    │                   │
       │   displayName)    │                   │
       │──────────────────►│                   │
       │                   │                   │
       │ welcome(you,      │                   │
       │   protocolVersion)│                   │
       │◄──────────────────│                   │
       │                   │                   │
       │ joinLobby(id)     │                   │
       │──────────────────►│                   │
       │                   │                   │
       │ lobbyUpdated(...)│   lobbyUpdated    │
       │◄──────────────────┼──────────────────►│
       │                   │                   │
       │ startMatch        │                   │
       │──────────────────►│                   │
       │                   │                   │
       │ matchStarted(...) │ matchStarted(...)│
       │◄──────────────────┼──────────────────►│
       │                   │                   │
       │       ◄── Cross-play: same match ──►  │
       ▼                   ▼                   ▼
```

### State Patch Flow

```
Server sends statePatch:
{
  "zones": { "p1": { "hand": [...] } },
  "permanents": { "3,2": [...] },
  "players": { "p1": { "life": 18 } }
}
           │
           ▼
┌──────────────────────────────────────┐
│ GameState.apply_patch()              │
│  - Deep merge with existing state    │
│  - Emit signals for changed sections │
└──────────────────────────────────────┘
           │
           ├──────────────────────────────────┐
           ▼                                  ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│ Hand3D._on_zones_updated │    │ Board._on_perms_updated  │
│  - Rebuild hand cards    │    │  - Update permanent nodes│
└──────────────────────────┘    └──────────────────────────┘
```

---

## Risks / Trade-offs

### Risk 1: Socket.IO Protocol Drift

**Risk:** Future Socket.IO versions may change protocol
**Mitigation:** Pin server to Socket.IO 4.x, document protocol

### Risk 2: Godot Version Churn

**Risk:** Godot 4.x APIs may change before LTS
**Mitigation:** Target Godot 4.3+ (stable), avoid experimental APIs

### Risk 3: Asset Loading Performance

**Risk:** HTTP texture loading may cause hitches
**Mitigation:** Background loader with priority queue, preload common assets

### Risk 4: State Desync Between Clients

**Risk:** Godot and web may diverge on edge cases
**Mitigation:** Extensive cross-client test suite, server-authoritative state

### Risk 5: Steam Review Rejection

**Risk:** Valve may reject for content/quality reasons
**Mitigation:** Submit for review early, follow Steam guidelines strictly

---

## Migration Plan

This is a new capability, not a migration. However, phased rollout:

1. **Alpha (internal):** Core gameplay, invite-only
2. **Closed Beta:** Steam beta branch, limited keys
3. **Open Beta:** Public Steam beta, free download
4. **Launch:** Full Steam release, marketing push

**Rollback:** If Godot client has critical issues, users fall back to web client. No data migration needed since both share server.

---

## Open Questions

1. **Steam authentication:** Use Steam ID as primary auth, or link to existing Curiosa account?
2. **Deck sync:** How to sync decks between web and Steam (both stored server-side)?
3. **Achievements:** Which achievements to define? (Win 10 matches, complete draft, etc.)
4. **F2P vs Paid:** Steam pricing model affects UI/UX design
5. **Steam Input:** Should we support Steam Controller/Deck controls?

---

## Testing Strategy

### Unit Tests (GDScript)

- Protocol parsing
- State patching
- Asset URL generation

### Integration Tests

- Connect to dev server
- Join lobby, start match
- Full game flow

### Cross-Client Tests

- Web vs Godot: same match
- Verify state sync after each action
- Edge cases: disconnection, reconnection

### Steam-Specific Tests

- Achievement unlocks
- Cloud save sync
- Overlay functionality
- Controller input (Steam Deck)
