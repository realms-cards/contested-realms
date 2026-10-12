import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { pushLog, checkStateBased, applyFlood } from '../../../engine/effects'
import { bodyOfWaterCells } from '../multi-card-utils/body-of-water'
import type { GameState, UnitState } from '../../../engine/types'

// The body of water the Avatar currently occupies: the contiguous cluster of orthogonally-adjacent
// water sites that includes its own site (via the shared bodyOfWater primitive, so Drought / rubble /
// per-instance water choices are honoured). Empty when the Avatar isn't on a water site -- "a fish out
// of water", the ability won't function.
function avatarWaterBody(state: GameState, self: UnitState) {
  return bodyOfWaterCells(state, self.x, self.y)
    .map((c) => siteAt(state, c.x, c.y))
    .filter((s): s is NonNullable<typeof s> => !!s)
}

// Sites you may flood: any site orthogonally adjacent to that body but not in it.
function avatarFloodTargets(state: GameState, self: UnitState): Set<string> {
  const body = avatarWaterBody(state, self)
  const inBody = new Set(body.map((s) => s.id))
  const out = new Set<string>()
  for (const b of body) for (const a of adjacentSquaresW(state, b.x, b.y)) {
    const ns = siteAt(state, a.x, a.y)
    if (ns && !inBody.has(ns.id)) out.add(ns.id)
  }
  return out
}

// 'Airborne / Tap → Flood a site adjacent to your body of water until you do so again. You may teleport there.'
registerScript('Avatar of Water', {
  abilities: [{
    key: 'flood',
    label: 'Tap → Flood a site adjacent to your waters',
    cost: { tap: true },
    // FAQ: "if the Avatar isn't in any body of water, the ability won't function"
    // -- hide it entirely when the Avatar is a fish out of water.
    available: (state, sourceId) => {
      const self = state.units[sourceId]
      return !!self && avatarWaterBody(state, self).length > 0
    },
    // only sites adjacent to the Avatar's own body of water are legal targets
    targets: [{ what: 'site', count: 1, targeted: false, label: 'a site adjacent to your body of water', filter: (state, site, self) => avatarFloodTargets(state, self).has(site.id) }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('site' in t)) return
      const site = ctx.state.sites[t.site]
      if (!site) return
      // defensive: reject a site not adjacent to your body of water
      if (!avatarFloodTargets(ctx.state, self).has(site.id)) return ctx.log('That site is not adjacent to your body of water.')
      // undo the previous flood from this ability
      const prev = self.counters?.avatarFloodSite
      if (prev !== undefined) {
        const prevSite = Object.values(ctx.state.sites).find((s) => s.id === `s${prev}` || s.id === String(prev))
        if (prevSite) prevSite.flooded = undefined
      }
      if (applyFlood(ctx.state, site, ctx.controller)) {
        self.counters = { ...self.counters, avatarFloodSite: site.id as any }
        pushLog(ctx.state, ctx.controller, `${site.name} floods.`)
      }
      checkStateBased(ctx.state)
      ctx.ask({ kind: 'yesNo', title: `Teleport to ${site.name}?` }, 'tp', { siteId: site.id })
    },
  }],
  conts: {
    tp: (ctx, contCtx, choice) => {
      if (!choice) return
      const site = ctx.state.sites[contCtx.siteId]
      if (site) ctx.teleport(ctx.sourceId, site.x, site.y, 'surface')
    },
  },
})
