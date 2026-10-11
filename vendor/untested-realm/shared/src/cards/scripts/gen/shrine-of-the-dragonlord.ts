import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Genesis → Teleport all Dragons here. / This site provides an additional (1)
//  and (E)(F)(W)(A).'
registerScript('Shrine of the Dragonlord', {
  extraManaEachTurn: 1,
  affinityBonus: { air: 1, earth: 1, fire: 1, water: 1 },
  genesis: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    for (const u of Object.values(ctx.state.units)) {
      // "here" = the Shrine's OWN location (its region — it can be buried/submerged), not always surface
      if (!u.isAvatar && effSubtypes(ctx.state, u).includes('Dragon')) ctx.teleport(u.id, art.x, art.y, art.region)
    }
    pushLog(ctx.state, ctx.controller, 'Every Dragon is drawn to the Shrine.')
  },
})
