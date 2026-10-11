import { registerScript } from '../registry'
import { pushLog, newId } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { cemeteryProtected } from '../../../engine/statics'
import type { GameState, PlayerId, Region } from '../../../engine/types'

// ------------------------------------------------- Kairos the Archivist ----
// 'Genesis → Archive the state of the realm.
//  Deathrite → Return all archived cards to their recorded state. Then banish Kairos.'
type UnitRec = { x: number; y: number; region: Region; damage: number; life?: number; deathsDoor?: boolean; controller: PlayerId; tapped: boolean; isAvatar: boolean; name: string }

type SiteRec = { x: number; y: number; controller: PlayerId | null; owner: PlayerId; flooded?: boolean; ward?: boolean; name: string }

type ArtRec = { x: number; y: number; region: Region; conjuredBy: PlayerId; carrierCard: string | null; name: string }

type AuraRec = { squares: { x: number; y: number }[]; controller: PlayerId; name: string }

function removeFromZones(state: GameState, cardId: string, actor: PlayerId): void {
  for (const p of Object.values(state.players)) {
    for (const zone of [p.hand, p.cemetery, p.banished, p.spellbook, p.atlas]) {
      // Wormelow Tump: an opponent's restore can't reach into a sealed cemetery
      if (zone === p.cemetery && cemeteryProtected(state, p.id, actor)) continue
      const at = zone.indexOf(cardId)
      if (at >= 0) zone.splice(at, 1)
    }
  }
}

registerScript('Kairos the Archivist', {
  genesis: (ctx) => {
    const s = ctx.state
    const units: Record<string, UnitRec> = {}
    const sites: Record<string, SiteRec> = {}
    const artifacts: Record<string, ArtRec> = {}
    const auras: Record<string, AuraRec> = {}
    for (const u of Object.values(s.units)) {
      // tokens are archived too — there are always more copies (FAQ)
      units[u.cardId] = { x: u.x, y: u.y, region: u.region, damage: u.damage, life: u.life, deathsDoor: u.deathsDoor, controller: u.controller, tapped: u.tapped, isAvatar: u.isAvatar, name: u.name }
    }
    for (const st of Object.values(s.sites)) {
      if (st.isRubble || s.cards[st.cardId]?.isToken) continue
      sites[st.cardId] = { x: st.x, y: st.y, controller: st.controller, owner: st.owner, flooded: st.flooded, ward: st.ward, name: st.name }
    }
    for (const a of Object.values(s.artifacts)) {
      const carrier = a.carriedBy ? s.units[a.carriedBy] : null
      artifacts[a.cardId] = { x: a.x, y: a.y, region: a.region, conjuredBy: a.conjuredBy, carrierCard: carrier?.cardId ?? null, name: a.name }
    }
    for (const r of Object.values(s.auras)) {
      if (s.cards[r.cardId]?.isToken) continue
      auras[r.cardId] = { squares: r.squares.map((q) => ({ ...q })), controller: r.controller, name: r.name }
    }
    s.flow = s.flow ?? {}
    s.flow.kairos = { units, sites, artifacts, auras }
    pushLog(s, ctx.controller, '📜 Kairos archives the state of the realm.')
  },
  deathrite: (ctx) => {
    const s = ctx.state
    const rec = s.flow?.kairos as { units: Record<string, UnitRec>; sites: Record<string, SiteRec>; artifacts: Record<string, ArtRec>; auras: Record<string, AuraRec> } | undefined
    if (!rec) return
    delete s.flow.kairos
    pushLog(s, ctx.controller, '📜 Kairos unwinds the realm to its archived state!')
    // sites first, so units land on solid ground
    for (const [cardId, r] of Object.entries(rec.sites)) {
      const existing = Object.values(s.sites).find((st) => st.cardId === cardId)
      if (existing) {
        existing.controller = r.controller
        existing.flooded = r.flooded
        existing.ward = r.ward
        continue
      }
      const there = siteAt(s, r.x, r.y)
      if (there) {
        // a site in the way of the returning record is banished (FAQ)
        delete s.sites[there.id]
        if (!there.isRubble && !s.cards[there.cardId]?.isToken) {
          s.players[there.owner].banished.push(there.cardId)
          pushLog(s, ctx.controller, `${there.name} is banished — the archive reclaims its square.`)
        }
      }
      removeFromZones(s, cardId, ctx.controller)
      const siteId = newId(s, 's')
      s.sites[siteId] = { id: siteId, cardId, name: r.name, owner: r.owner, controller: r.controller, x: r.x, y: r.y, tapped: false, isRubble: false, flooded: r.flooded, ward: r.ward }
    }
    for (const [cardId, r] of Object.entries(rec.units)) {
      const existing = Object.values(s.units).find((u) => u.cardId === cardId)
      if (existing) {
        existing.x = r.x; existing.y = r.y; existing.region = r.region
        existing.damage = r.damage; existing.controller = r.controller; existing.tapped = r.tapped
        if (existing.isAvatar) { existing.life = r.life; existing.deathsDoor = r.deathsDoor }
        continue
      }
      if (r.isAvatar) continue // a gone avatar means the game already ended
      removeFromZones(s, cardId, ctx.controller)
      const unitId = newId(s, 'u')
      s.units[unitId] = {
        id: unitId, cardId, name: r.name, owner: s.cards[cardId]?.owner ?? r.controller, controller: r.controller,
        isAvatar: false, x: r.x, y: r.y, region: r.region, tapped: r.tapped, damage: r.damage,
        enteredTurn: s.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      }
    }
    for (const [cardId, r] of Object.entries(rec.artifacts)) {
      if (cardId === (s.units[ctx.sourceId] ?? s.artifacts[ctx.sourceId])?.cardId) continue // Kairos himself is being banished
      const carrier = r.carrierCard ? Object.values(s.units).find((u) => u.cardId === r.carrierCard) : null
      const existing = Object.values(s.artifacts).find((a) => a.cardId === cardId)
      if (existing) {
        if (existing.carriedBy && existing.carriedBy !== carrier?.id) {
          const old = s.units[existing.carriedBy]
          if (old) old.carrying = old.carrying.filter((id) => id !== existing.id)
          existing.carriedBy = null
        }
        if (carrier && existing.carriedBy !== carrier.id) {
          existing.carriedBy = carrier.id
          carrier.carrying.push(existing.id)
        }
        existing.x = carrier?.x ?? r.x; existing.y = carrier?.y ?? r.y; existing.region = carrier?.region ?? r.region
        continue
      }
      removeFromZones(s, cardId, ctx.controller)
      const artId = newId(s, 'a')
      s.artifacts[artId] = {
        id: artId, cardId, name: r.name, conjuredBy: r.conjuredBy,
        x: carrier?.x ?? r.x, y: carrier?.y ?? r.y, region: carrier?.region ?? r.region,
        carriedBy: carrier?.id ?? null, tapped: false,
      }
      if (carrier) carrier.carrying.push(artId)
    }
    for (const [cardId, r] of Object.entries(rec.auras)) {
      const existing = Object.values(s.auras).find((a) => a.cardId === cardId)
      if (existing) {
        existing.controller = r.controller
        existing.squares = r.squares.map((q) => ({ ...q }))
        continue
      }
      removeFromZones(s, cardId, ctx.controller)
      const auraId = newId(s, 'r')
      s.auras[auraId] = { id: auraId, cardId, name: r.name, controller: r.controller, squares: r.squares.map((q) => ({ ...q })) }
    }
    // then banish Kairos: pre-empt the cemetery trip (he's an automaton UNIT)
    const self = s.units[ctx.sourceId]
    if (self) {
      delete s.units[self.id]
      const owner = s.cards[self.cardId]?.owner
      if (owner !== undefined) s.players[owner].banished.push(self.cardId)
      pushLog(s, ctx.controller, 'Kairos, his archive spent, is banished.')
    }
  },
})
