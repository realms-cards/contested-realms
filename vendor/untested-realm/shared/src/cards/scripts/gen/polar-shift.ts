import { registerScript, getScript, type EffectAPI } from '../registry'
import { GRID_H, realmIsFlat } from '../../../engine/grid'
import { siteCantBeMoved, pushLog, checkStateBased } from '../../../engine/effects'
import { moveSitesWithContents } from '../multi-card-utils/move-sites'
import type { SiteState } from '../../../engine/types'

// 'Shift the realm north or south, moving all sites one step as if the top and bottom edges were
// connected. Draw a spell.'
// Every site moves one row with everything of normal size on it; the edge row wraps to the other edge.
// A site that can't be moved (Bedrock, a Bluecap Knockers site) stays, and so does any site that would
// land on a site staying put. Flat Realm Society: the realm can't be shifted — only the draw happens.
registerScript('Polar Shift', {
  onCast: (ctx) => {
    if (realmIsFlat(ctx.state)) {
      ctx.log('The realm is flat — it will not shift.')
      return ctx.draw(ctx.controller, 'spellbook', 1)
    }
    ctx.ask({ kind: 'chooseOption', title: 'Polar Shift: shift the realm which way?', data: { options: shiftOptions(ctx.controller) } }, 'shift')
  },
  conts: {
    shift: (ctx, _c, choice) => {
      const i = shiftOptions(ctx.controller).indexOf(choice as string)
      if (i >= 0) polarShift(ctx, i === 0 ? 1 : -1)
      ctx.draw(ctx.controller, 'spellbook', 1)
    },
  },
})

/** north (+y) / south, labelled from the caster's seat: the board is drawn from each player's side */
function shiftOptions(player: number): string[] {
  return player === 0 ? ['north (away from you)', 'south (toward you)'] : ['north (toward you)', 'south (away from you)']
}

function polarShift(ctx: EffectAPI, dy: 1 | -1): void {
  const state = ctx.state
  const sites = Object.values(state.sites)
  const dest = (s: SiteState) => ({ x: s.x, y: (s.y + dy + GRID_H) % GRID_H })
  // An immovable site (Bedrock, a Bluecap Knockers site) stays; whatever would land on a site that stays
  // can't move either — repeat until nothing changes.
  const staying = new Set(sites.filter((s) => siteCantBeMoved(state, s)).map((s) => s.id))
  for (let changed = true; changed;) {
    changed = false
    for (const s of sites) {
      if (staying.has(s.id)) continue
      const d = dest(s)
      if (sites.some((o) => o.x === d.x && o.y === d.y && staying.has(o.id))) {
        staying.add(s.id)
        changed = true
      }
    }
  }
  const moving = sites.filter((s) => !staying.has(s.id))
  // a shift that strands a placement-restricted site (Edge of the World: "must always be adjacent to the
  // void") can't happen — like Earthquake, nothing moves
  const stranded = () => moving.some((s) => getScript(s.name)?.sitePlacement?.(state, s.controller ?? ctx.controller, { x: s.x, y: s.y }) === 'deny')
  if (!moveSitesWithContents(state, ctx.controller, moving.map((s) => ({ from: { x: s.x, y: s.y }, to: dest(s) })), stranded)) {
    pushLog(state, ctx.controller, 'Polar Shift: that shift would strand a site — the realm holds.')
    return
  }
  pushLog(state, ctx.controller, `🧭 The realm shifts ${dy === 1 ? 'north' : 'south'}!`)
  checkStateBased(state)
}
