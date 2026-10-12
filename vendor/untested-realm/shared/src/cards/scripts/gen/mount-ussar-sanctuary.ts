import { registerScript } from '../registry'
import { pushLog, wardUnit } from '../../../engine/effects'
import { affinity } from '../../../engine/casting'

// '(E)(E)(E)(E) — When your Avatar arrives at Death's Door, they flee here and gain Ward.'
registerScript('Mount Ussar Sanctuary', {
  onDeathsDoor: (ctx, avatar) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || avatar.controller !== ctx.controller) return
    // (E)(E)(E)(E) is a true-affinity gate (Sanctuary's own Earth + bonuses), not just printed Earth.
    if (affinity(ctx.state, ctx.controller).earth < 4) return
    ctx.teleport(avatar.id, self.x, self.y, 'surface')
    wardUnit(ctx.state, avatar) // avatar is not a minion — wardable even if Demon-typed
    pushLog(ctx.state, ctx.controller, `${avatar.name} flees to the Sanctuary and is warded.`)
  },
})
