import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'

// 'Genesis → Return each Airborne minion here to its owner's hand. /
//  Airborne minions can't enter this location.'
registerScript('Scarecrow', {
  genesis: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    // "each Airborne minion here" = the Scarecrow's OWN location/region (it can be buried/submerged)
    for (const u of unitsAt(ctx.state, art.x, art.y, art.region)) {
      if (!u.isAvatar && effKeywords(ctx.state, u).airborne) ctx.bounce(u.id)
    }
  },
  entryFilter: (state, selfId, unit, _from, to) => {
    // a carried Scarecrow is at its bearer's location (art.x/y/region follow the bearer); the bearer
    // itself carries it along, so only OTHER Airborne minions are kept out
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy === unit.id) return true
    if (to.x !== art.x || to.y !== art.y || to.region !== art.region) return true
    return !effKeywords(state, unit).airborne
  },
})
