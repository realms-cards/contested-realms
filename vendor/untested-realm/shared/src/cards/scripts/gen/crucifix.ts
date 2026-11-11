import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { isEvilUnitIntrinsic } from '../../../engine/statics'

// "Genesis → Return each Evil minion here to its owner's hand. / Evil minions
// can't enter this location."
registerScript('Crucifix', {
  genesis: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    // "each Evil minion here" = the Crucifix's OWN location (its region — it can be buried/submerged)
    for (const u of unitsAt(ctx.state, art.x, art.y, art.region)) {
      if (!u.isAvatar && isEvilUnitIntrinsic(ctx.state, u)) ctx.bounce(u.id)
    }
  },
  // "can't enter" is absolute: it also stops a summon (Codex Summon/Enter) or a forced move here
  entryFilterBlocksForcedEntry: true,
  entryFilter: (state, selfId, unit, from, to) => {
    const art = state.artifacts[selfId]
    if (!art || unit.isAvatar) return true
    // "this location" is the Crucifix's own square AND region — entering a different layer isn't entering here
    if (to.x !== art.x || to.y !== art.y || to.region !== art.region) return true
    return !isEvilUnitIntrinsic(state, unit) // Evil as the realm sees it now (Saint of Redemption: no minion is)
  },
})
