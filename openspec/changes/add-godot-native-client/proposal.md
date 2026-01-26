# Godot Native Client Proposal

## Why

The current Three.js/React/Next.js web client has served well for rapid prototyping and cross-platform browser access. However, pursuing a **Steam release** and native desktop experience requires evaluating alternative rendering engines. Godot Engine offers:

1. **Native performance** - Direct GPU access without browser overhead
2. **Steam integration** - First-class Steamworks SDK support via GodotSteam
3. **Multi-platform exports** - Windows, macOS, Linux, mobile from one codebase
4. **Open source** - MIT license, no royalties, full source access
5. **GDScript + C#** - Familiar syntax for web developers

This proposal evaluates creating a **parallel Godot client** that shares the backend server while maintaining future compatibility.

---

## Executive Summary

| Aspect               | Current (Three.js) | Proposed (Godot)       |
| -------------------- | ------------------ | ---------------------- |
| Platform             | Browser-only       | Steam + Desktop native |
| Rendering            | WebGL 2 (limited)  | Vulkan/OpenGL native   |
| Performance          | ~60 FPS, 4GB+ RAM  | ~144 FPS, <1GB RAM     |
| Steam Integration    | Not possible       | Native Steamworks      |
| Offline Play         | Limited (PWA)      | Full offline support   |
| Development          | TypeScript/React   | GDScript or C#         |
| Server Compatibility | Socket.IO          | Socket.IO (shared)     |

---

## Current Architecture Analysis

### What We Have

**1. Networking Layer** (`src/lib/net/`)

- `protocol.ts` - Zod schemas for all client↔server messages (586 lines)
- `transport.ts` - Abstract transport interface (224 lines)
- `socketTransport.ts` - Socket.IO implementation
- **Key insight**: Protocol is transport-agnostic; can be ported to Godot

**2. Game State** (`src/lib/game/store/`)

- Zustand store with 60+ slices (~85 files)
- ~2,500 lines in `types.ts` alone
- Complex state: zones, permanents, combat, magic interactions
- **Key insight**: State logic is tightly coupled to React; needs rewrite

**3. 3D Rendering** (`src/lib/game/components/`)

- 43 React Three Fiber components
- `Board.tsx` (48KB), `Hand3D.tsx` (62KB), `PermanentStack.tsx` (55KB)
- Custom card geometry, textures, animations
- **Key insight**: Rendering is the largest rewrite effort

**4. Server** (`server/`)

- Node.js + Socket.IO (~172KB main index.ts)
- PostgreSQL via Prisma
- Redis for state/scaling
- **Key insight**: Server stays unchanged; both clients connect to it

### Component Coupling Analysis

```
┌─────────────────────────────────────────────────────────────┐
│                    SHARED (No Changes)                       │
├─────────────────────────────────────────────────────────────┤
│  Server (Node.js + Socket.IO)                               │
│  Database (PostgreSQL + Prisma)                             │
│  Redis (state sync + scaling)                               │
│  Protocol Schemas (can be ported to GDScript)               │
│  Card Data API (/api/cards/*)                               │
│  Asset CDN (textures, KTX2)                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    GODOT CLIENT (New)                        │
├─────────────────────────────────────────────────────────────┤
│  Rendering (Godot 4.x native scenes)                        │
│  State Management (GDScript or C# equivalent)               │
│  Networking (Godot WebSocketPeer → Socket.IO)               │
│  UI (Godot Control nodes)                                   │
│  Steam Integration (GodotSteam)                             │
│  Audio (Godot AudioServer)                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    WEB CLIENT (Maintained)                   │
├─────────────────────────────────────────────────────────────┤
│  Three.js/R3F rendering                                     │
│  React/Next.js UI                                           │
│  Browser-specific features (WebRTC, PWA)                    │
│  Mobile browser support                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Godot Technical Evaluation

### Godot 4.x Advantages for TCG

| Feature              | Benefit for Sorcery                                     |
| -------------------- | ------------------------------------------------------- |
| **Vulkan renderer**  | Crisp card rendering, PBR materials                     |
| **2D/3D hybrid**     | Cards as 3D meshes with 2D textures                     |
| **Node system**      | Clean component hierarchy for cards, piles, board       |
| **Signals**          | Event-driven state updates (like Zustand subscriptions) |
| **Resource system**  | Efficient texture/asset management                      |
| **Animation system** | Smooth card movements, flips, attacks                   |
| **GDExtension**      | C++ plugins for performance-critical code               |
| **Export templates** | One-click Steam builds                                  |

### Socket.IO Compatibility

Godot doesn't have native Socket.IO, but solutions exist:

1. **WebSocketPeer + custom protocol** - Parse Socket.IO frames manually
2. **GDScript Socket.IO library** - Community implementations exist
3. **HTTP long-polling fallback** - If WebSocket fails
4. **Recommended**: Create thin GDScript wrapper matching `GameTransport` interface

```gdscript
# Example: transport.gd
class_name GameTransport extends RefCounted

signal state_patch(patch: Dictionary)
signal match_started(info: Dictionary)
signal chat(message: Dictionary)

func connect_to_server(url: String, display_name: String) -> void:
    pass

func send_action(action: Dictionary) -> void:
    pass
```

### Asset Strategy

Current assets can be reused:

- **Card textures** - PNG/WebP from CDN work directly
- **KTX2** - Godot 4 supports Basis Universal transcoding
- **3D models** - OBJ/GLTF in `public/3dmodels/` compatible
- **Fonts** - TTF in `public/` work directly

---

## Steam Release Requirements

### Steamworks Integration

| Feature           | Implementation                                      |
| ----------------- | --------------------------------------------------- |
| **Achievements**  | Define via Steamworks dashboard, trigger from Godot |
| **Leaderboards**  | Use existing `MatchResult` data, push to Steam      |
| **Cloud Saves**   | Sync deck lists, preferences                        |
| **Friends**       | Steam friends list for invites                      |
| **Overlay**       | Native Steam overlay works in Godot                 |
| **Rich Presence** | Show "In Match: Player vs Opponent"                 |
| **Trading Cards** | Submit card art through Steam partner portal        |

### GodotSteam Plugin

```gdscript
# Example Steam integration
extends Node

func _ready():
    Steam.steamInit()
    if Steam.isSteamRunning():
        print("Steam running, user: ", Steam.getPersonaName())

func unlock_achievement(id: String):
    Steam.setAchievement(id)
    Steam.storeStats()
```

### Steam Store Requirements

1. **App ID** - Apply via Steamworks partner portal (~$100 fee)
2. **Store page assets** - Screenshots, trailer, capsule images
3. **Age rating** - PEGI/ESRB (TCG usually 12+)
4. **Legal** - Curiosa IP licensing for Steam distribution
5. **Pricing** - F2P with optional cosmetics, or one-time purchase

---

## Compatibility Strategy

### Protocol Versioning

Add version negotiation to prevent client/server mismatch:

```typescript
// Server: protocol.ts
export const PROTOCOL_VERSION = "1.0.0";

// On hello, server sends:
{ protocolVersion: "1.0.0", minClientVersion: "0.9.0" }
```

```gdscript
# Godot client checks compatibility
func _on_welcome(data: Dictionary):
    var server_version = data.get("protocolVersion", "0.0.0")
    if not is_compatible(server_version):
        show_update_dialog()
```

### Feature Parity Matrix

| Feature          | Web | Godot | Priority        |
| ---------------- | --- | ----- | --------------- |
| Constructed play | ✅  | P0    | Must-have       |
| Draft 2-player   | ✅  | P0    | Must-have       |
| Sealed           | ✅  | P0    | Must-have       |
| Deck builder     | ✅  | P1    | High            |
| Card collection  | ✅  | P1    | High            |
| Tournaments      | ✅  | P2    | Medium          |
| Replays          | ✅  | P2    | Medium          |
| WebRTC voice     | ✅  | P3    | Use Steam Voice |
| Custom cardbacks | ✅  | P1    | High            |
| Bot opponents    | ✅  | P1    | High            |

### Cross-Play

Both clients connect to same server - automatic cross-play:

```
┌─────────────┐     Socket.IO     ┌─────────────┐
│ Web Client  │◄─────────────────►│   Server    │
│ (Browser)   │                   │ (Node.js)   │
└─────────────┘                   └──────┬──────┘
                                         │
┌─────────────┐     Socket.IO     ┌──────▼──────┐
│ Godot Client│◄─────────────────►│   Server    │
│ (Steam)     │                   │ (Node.js)   │
└─────────────┘                   └─────────────┘
```

---

## Risk Assessment

### High Risks

| Risk                       | Mitigation                                 |
| -------------------------- | ------------------------------------------ |
| **Large rewrite effort**   | Phase 0: MVP with constructed play only    |
| **State sync bugs**        | Extensive cross-client testing matrix      |
| **Godot Socket.IO issues** | Prototype networking first, before 3D      |
| **Curiosa IP licensing**   | Confirm Steam distribution rights early    |
| **Maintenance burden**     | Share protocol schemas via code generation |

### Medium Risks

| Risk                        | Mitigation                                |
| --------------------------- | ----------------------------------------- |
| **Art style differences**   | Use same shaders/materials where possible |
| **Godot version churn**     | Target LTS (4.3+)                         |
| **Steam review process**    | Submit early for feedback                 |
| **Community fragmentation** | In-game announcements cross-platform      |

### Low Risks

| Risk                | Notes                         |
| ------------------- | ----------------------------- |
| Performance         | Godot is faster than WebGL    |
| Asset compatibility | Most assets transfer directly |
| Learning curve      | GDScript is Python-like       |

---

## What Changes

### New Components (Godot)

- **Godot project** - Separate repository or monorepo subfolder
- **GDScript protocol** - Port of `protocol.ts` types
- **GDScript transport** - Socket.IO client wrapper
- **GDScript game state** - Equivalent of Zustand store
- **3D scenes** - Board, cards, piles, avatars
- **UI scenes** - Menus, deck builder, collection
- **Steam integration** - GodotSteam plugin
- **Build pipeline** - GitHub Actions for Steam uploads

### Server Changes (Minimal)

- Protocol version header in `hello` response
- Client type identification (`web` vs `godot` vs `steam`)
- Optional: Steam authentication via Steamworks Web API

### Web Client Changes (None required)

- Continues to work unchanged
- Shares server with Godot clients

---

## Impact

### Affected Specs

- None directly (new capability)

### Affected Code

- `server/index.ts` - Minor: add protocol version to welcome
- New repository or subfolder for Godot project

### Effort Estimate

| Phase                     | Effort          | Duration                     |
| ------------------------- | --------------- | ---------------------------- |
| Phase 0: Prototype        | 2-3 weeks       | Networking + basic board     |
| Phase 1: Core gameplay    | 6-8 weeks       | Full match flow              |
| Phase 2: Deck/collection  | 4-6 weeks       | Builder + sealed/draft       |
| Phase 3: Polish           | 4-6 weeks       | UI, audio, Steam integration |
| Phase 4: Steam submission | 2-4 weeks       | Store page, QA, launch       |
| **Total**                 | **18-27 weeks** | ~5-7 months                  |

### Team Requirements

- 1-2 developers with Godot experience
- Access to Steam partner portal
- QA for cross-client testing

---

## Alternatives Considered

### 1. Electron Wrapper

- **Pros**: Reuse existing code 100%
- **Cons**: High memory (2-4GB), poor performance, no Steam overlay
- **Verdict**: Not viable for Steam release

### 2. Unity

- **Pros**: Larger ecosystem, easier Steam integration
- **Cons**: Expensive for small teams, C# only, license concerns
- **Verdict**: Overkill for 2D/3D hybrid TCG

### 3. Unreal Engine

- **Pros**: AAA quality rendering
- **Cons**: Extreme overkill, C++, massive build sizes
- **Verdict**: Not appropriate for card game

### 4. Native C++ with SDL/SFML

- **Pros**: Maximum control and performance
- **Cons**: Massive development time, no tooling
- **Verdict**: Too expensive in dev time

### 5. Godot (Selected)

- **Pros**: Right-sized for TCG, open source, great Steam support
- **Cons**: Smaller ecosystem than Unity
- **Verdict**: Best balance of capability vs complexity

---

## Recommendation

**Proceed with Godot 4.x client development** in phases:

1. **Phase 0 (2-3 weeks)**: Prototype networking and basic board
   - Validate Socket.IO connectivity from Godot
   - Render static board with placeholder cards
   - Connect to existing server, observe state patches

2. **Phase 1 (6-8 weeks)**: Core gameplay
   - Full match flow: mulligan → play → combat → end
   - Card interactions, zones, permanents
   - Basic UI for game state

3. **Phase 2 (4-6 weeks)**: Deck and collection
   - Deck builder with drag-and-drop
   - Sealed/draft support
   - Card preview and search

4. **Phase 3 (4-6 weeks)**: Polish and Steam
   - Audio system with existing sounds
   - Settings, preferences
   - GodotSteam integration
   - Achievements, cloud saves

5. **Phase 4 (2-4 weeks)**: Launch
   - Steam store page
   - Beta testing
   - Launch marketing

---

## Open Questions

1. **Licensing**: Does Curiosa permit Steam distribution of Sorcery TCG client?
2. **Monetization**: F2P with cosmetics? One-time purchase? Tie to Curiosa accounts?
3. **Repository structure**: Separate repo or monorepo subfolder?
4. **Team**: Who will develop the Godot client?
5. **Priority**: Should Godot development block web improvements?
