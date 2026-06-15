# Server-Authoritative Zone Integrity — Implementation

Status: **landed, flag-gated (dark-launch / warn-first)**. No behavior change until the flags below are turned on.

This implements the layered authorization model for cross-seat zone writes and
hidden-zone confidentiality described in the design proposal. It closes two
vulnerabilities found in the audit:

1. **Confidentiality** — the server broadcast the full merged state (including
   both players' hidden zones) to both players; the client UI was the only thing
   hiding the opponent's hand/deck. A modified client could read it off the wire.
2. **Integrity** — a seated player's client could set a cross-seat flag and
   overwrite/fabricate/delete cards in any zone, including the opponent's.

## Layers

| Layer | What it does | Where | Flag | Default |
|---|---|---|---|---|
| 0 | Per-seat projection: redact each opponent's hidden zones (hand/spellbook/atlas) to count-only placeholders in outbound broadcasts | server | `ZONE_PROJECTION_ENABLED` | off |
| 1 | Card-conservation invariant: instanceIds may not be fabricated/deleted/duplicated (tokens excepted) | server | `ZONE_INTEGRITY_MODE` | off |
| 2 | Cross-seat capability: opponent zones may only be written via a declared `crossSeat` effect, within that effect's zone envelope | server + client | `ZONE_INTEGRITY_MODE` | off |

`ZONE_INTEGRITY_MODE` ladder: `off` → `warn` (log + non-fatal `integrityWarning` to actor, never reject) → `bot_only` (reject for CPU bots, warn for humans) → `all` (reject for everyone).

## Files changed

### Server
- **`server/modules/zone-integrity.ts`** (new) — pure, unit-tested module:
  - `SERVER_TOKEN_SLUGS` + `isTokenCard()` — token whitelist (mirrors `src/lib/game/tokens.ts`; keep in sync when a token is added).
  - `collectInstanceIds(game)` — every card instanceId across both seats' 7 zones + all permanent cells.
  - `CROSS_SEAT_CAPABILITIES` + `CrossSeatEffectId` — per-effect allowed opponent-zone envelope (derived from the audited caller catalog).
  - `deriveCrossSeat(patch)` — reads `crossSeat` (preferred) or legacy `__allowZoneSeats`.
  - `validateZoneIntegrity(prevGame, nextGame, patch, actorSeat)` — combined Layer 1 + 2 check returning typed violations.
- **`server/modules/match-leader.ts`**:
  - `projectPatchForViewer(patch, viewerSeat)` (Layer 0) reusing the spectator sanitizer; per-seat emit wired into the broadcast block behind `zoneProjectionEnabled`.
  - Integrity validation block after the client merge commits to `match.game` (compares `baseForMerge` vs merged), behind `zoneIntegrityMode`. On enforce it reverts `match.game = baseForMerge`, emits a `zone_integrity_violation` error, and returns.
  - Zone sanitizer now reads `crossSeat.seats` (fallback `__allowZoneSeats`) and strips both internal flags before applying. The descriptor is captured *before* stripping so the post-merge validator can read it.
- **`server/index.ts`** — reads `ZONE_PROJECTION_ENABLED` / `ZONE_INTEGRITY_MODE` env, passes `zoneProjectionEnabled` / `zoneIntegrityMode` into the match-leader deps.

### Client
- **`src/lib/game/store/types.ts`** — `CrossSeatEffectId`, `CrossSeatDescriptor`, and `crossSeat` / `__allowZoneSeats` fields on `ServerPatchT`.
- **`src/lib/game/store/utils/zoneHelpers.ts`** — `setCrossSeatAuth(patch, effect, seats)` sets `crossSeat` and mirrors `__allowZoneSeats` (transition compatibility).
- **`src/lib/game/store/transportState.ts`** — `readCrossSeatSeats()` helper; both outbound zone-filter blocks now honor `crossSeat.seats`.
- **12 caller sites migrated** from raw `__allowZoneSeats` to `setCrossSeatAuth`:
  | Effect id | File(s) |
  |---|---|
  | `infiltrate` | `infiltrateState.ts` ×2 |
  | `betrayal` | `betrayalState.ts` ×2 |
  | `sea_raider` | `seaRaiderState.ts` |
  | `site_destroy` | `boardState.ts` ×2 |
  | `control_transfer` | `boardState.ts` ×1, `gameActions/permanentMovement.ts` ×1 |
  | `permanent_move` | `gameActions/permanentMovement.ts` ×1 |
  | `banish_graveyard` | `zoneState.ts` ×2 |

### Layer 0 — server-mediated reveals (the projection enabler)

Projection redacts the opponent's hidden zones to face-down placeholders, so the
actor's client no longer holds the opponent's real cards. Effects that need them
(reveal/select/manipulate opponent hidden zones) now fetch the authoritative
cards from the server on demand.

- **`server/index.ts`** — `revealZones` branch in the `socket.on("message")`
  handler: validates the requester is a seated player, reads the authoritative
  `match.game.zones[targetSeat]` for the requested hidden zones
  (hand/spellbook/atlas only), and returns them via a `revealZonesResult`
  message to that player's room alone. Requests are logged for audit.
- **`src/lib/game/store/utils/revealZones.ts`** (new):
  - `isHiddenPlaceholder` / `hasHiddenPlaceholders` — detect the `{cardId:0,
    faceDown:true}` sentinel.
  - `requestZoneReveal` / `resolveZoneReveal` — requestId-keyed promise round-trip.
  - `getAuthoritativeZones(get, seat, zones)` — the drop-in accessor: returns
    local data in hotseat / own seat / when data is already real; fetches from
    the server only when online **and** the local copy is placeholders; falls
    back to local on timeout so effects degrade rather than crash.
- **`src/lib/game/store/customMessageHandlers.ts`** — routes inbound
  `revealZonesResult` to `resolveZoneReveal`.
- **Effects migrated** to `getAuthoritativeZones` at their opponent-hidden-zone
  reads:
  | Effect | Read kind | Mutation |
  |---|---|---|
  | Inquisition (`beginInquisition`) | reveal-to-select hand | delegated to victim via message |
  | Feast for Crows (`nameFeastForCrows`) | reveal/match hand+spellbook | delegated to victim |
  | Accusation (`beginAccusation`) | reveal hand | delegated to victim |
  | Sea Raider (`triggerPiracy`) | spellbook | caster-built crossSeat patch |
  | Searing Truth (`selectSearingTruthTarget`) | spellbook+hand | caster-built crossSeat patch |
  | Pith Imp (`triggerPithImpGenesis`) | hand | caster-built crossSeat patch |
- **Already projection-safe (not changed):** Lilith and Mother Nature (read
  their *own* spellbook or use the victim-responds message flow); graveyard /
  banished / battlefield reads everywhere (public zones are never redacted).

### Tests
- **`tests/server/zone-integrity.test.ts`** (15 cases) — token detection, id collection, descriptor parsing, conservation pass/fail, capability accept/reject/out-of-envelope/legacy.
- **`tests/unit/reveal-zones.test.ts`** (6 cases) — placeholder detection; accessor returns local in hotseat / when real; fetches via server reveal when placeholders; request/resolve round-trip.

## Verification
- `tsc --noEmit` (client) and `tsc -p server/tsconfig.json --noEmit` (server): clean.
- `zone-integrity` + `reveal-zones` tests: 21/21 pass.
- ESLint on all changed files: clean.
- Pre-existing unrelated failures in `match-helpers.merge.test.ts` / `match-leader.zones.test.ts` confirmed present on the base commit (not caused by this change).

## Rollout

1. **`ZONE_INTEGRITY_MODE=warn`** in staging/prod. Watch logs for
   `[zone-integrity] violation`. Expected false positives come from **delta
   patches that don't carry both ends of a card move** (e.g. a patch updates a
   zone's count without the counterpart zone/permanent in the same patch). Use
   the warn channel + the bot self-play harness (`scripts/training/selfplay.js`)
   to flush these out and adjust before enforcing.
2. **`ZONE_INTEGRITY_MODE=bot_only`** — enforce for CPU first.
3. **`ZONE_INTEGRITY_MODE=all`** — once the warn channel is quiet for a release.
4. **`ZONE_PROJECTION_ENABLED=true`** — independent of the integrity ladder, and
   now unblocked: the client renders the opponent's hidden zones as card-backs
   (counts preserved) and the migrated reveal effects fetch authoritative cards
   from the server on demand. **Test focus when enabling:**
   - Normal play: opponent hand/deck never appears in `statePatch` payloads on
     the wire (inspect the socket frames); counts and card-backs still correct.
   - Reveal/manipulation cards: Inquisition, Feast for Crows, Accusation, Sea
     Raider, Searing Truth, Pith Imp — confirm they see/operate on the real
     opponent cards (these are the server-mediated paths). Lilith and Mother
     Nature should be unaffected.
   - Disconnect/timeout: if a reveal request times out (5s), the effect degrades
     to local data rather than crashing — verify it doesn't hard-fail.

## Known limitations (by design)

- **Server-mediated reveal has the same authorization ceiling as Layer 2.** The
  `revealZones` endpoint gates on "requester is a seated player" only — a
  malicious client could request the opponent's hidden zones at will. This is
  strictly better than the previous passive wire-leak (reveals are now active,
  per-request, and logged) but is not a full guarantee; tying a reveal to a
  server-verified pending effect requires Layer 3 simulation. Requests are
  logged (`[reveal] revealZones`) and could be rate-limited as a follow-up.
- **Transient local retention.** A caster-built effect (Sea Raider / Searing
  Truth / Pith Imp) briefly holds the revealed opponent cards in local state
  after resolving, until the next projected patch overwrites them. The wire and
  long-term state stay redacted; the reveal itself is a legitimate disclosure.

- **Conservation is necessary, not sufficient.** It blocks fabricate/delete/
  duplicate but not the *relocation* of an opponent's own cards between their
  zones — that's what Layer 2's capability envelope bounds.
- **Capability has a ceiling without full simulation.** A malicious client can
  still *declare a real effect* to access its envelope (e.g. declare
  `sea_raider` to mill with no Sea Raider in play). Verifying the effect is
  actually in play (cost paid, target legal) is the Layer 3 server-authoritative
  simulation, out of scope here. Layers 0–2 eliminate every exploit that leaks
  hidden info or creates/destroys material, and reduce the residual to
  legal-shaped relocations that always produce a public-zone change the opponent
  can see.
- **Token whitelist is mirrored, not imported.** Server cannot import client
  code; `SERVER_TOKEN_SLUGS` must be kept in sync with `src/lib/game/tokens.ts`.
