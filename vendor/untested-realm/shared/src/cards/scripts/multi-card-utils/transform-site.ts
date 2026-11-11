import { type EffectAPI } from '../registry'
import { pushLog, checkStateBased, newId, placeRubble } from '../../../engine/effects'
import type { UnitState } from '../../../engine/types'

// 'A site rises from the land itself as a minion.' (Horns of Behemoth / Island Leviathan)
export function transformSite(ctx: EffectAPI, floodRubble: boolean): void {
  const site = ctx.state.sites[ctx.sourceId]
  if (!site || site.controller === null) return
  const unitId = newId(ctx.state, 'u')
  const unit: UnitState = {
    id: unitId, cardId: site.cardId, name: site.name, owner: site.owner, controller: site.controller,
    isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
    // FAQ: not summoning sick if the site was in the realm before this turn; a site
    // played this turn awakens sick
    enteredTurn: site.enteredTurn === ctx.state.turn ? ctx.state.turn : ctx.state.turn - 1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    // it TRANSFORMED from a site — it wasn't "summoned", so Order of the White Wing ignores it
    counters: { transformed: 1 },
  }
  ctx.state.units[unitId] = unit
  delete ctx.state.sites[site.id]
  // rubble underneath — the awakened thing needs somewhere to stand
  placeRubble(ctx.state, site.x, site.y, site.owner, { flooded: floodRubble })
  pushLog(ctx.state, site.controller, `🌋 ${site.name} rises from the land itself!`)
  // a transform is not an entry: no "whenever … enters" trigger fires for it
  checkStateBased(ctx.state)
}
