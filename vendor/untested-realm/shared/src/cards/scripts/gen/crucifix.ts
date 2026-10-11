import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'

// "Genesis → Return each Evil minion here to its owner's hand. / Evil minions
// can't enter this location."
registerScript('Crucifix', {
  genesis: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    // "each Evil minion here" = the Crucifix's OWN location (its region — it can be buried/submerged)
    for (const u of unitsAt(ctx.state, art.x, art.y, art.region)) {
      if (u.isAvatar) continue
      const st = effSubtypes(ctx.state, u)
      if (st.includes('Demon') || st.includes('Undead') || st.includes('Monster')) ctx.bounce(u.id)
    }
  },
  entryFilter: (state, selfId, unit, from, to) => {
    const art = state.artifacts[selfId]
    if (!art || unit.isAvatar) return true
    // "this location" is the Crucifix's own square AND region — entering a different layer isn't entering here
    if (to.x !== art.x || to.y !== art.y || to.region !== art.region) return true
    const st = effSubtypes(state, unit)
    return !(st.includes('Demon') || st.includes('Undead') || st.includes('Monster'))
  },
})
