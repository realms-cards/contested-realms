import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effSubtypes, cemeteryProtected } from '../../../engine/statics'

// 'Allied Giants banish the minions they kill to permanently gain +1 power.'
registerScript('Blunderbore', {
  onUnitKilled: (ctx, victim, killer) => {
    if (victim.isAvatar || killer.controller !== ctx.controller) return
    if (!effSubtypes(ctx.state, killer).includes('Giant')) return
    if (cemeteryProtected(ctx.state, victim.owner, ctx.controller)) return
    const owner = ctx.state.players[victim.owner]
    const at = owner.cemetery.lastIndexOf(victim.cardId)
    if (at >= 0) owner.banished.push(owner.cemetery.splice(at, 1)[0])
    ctx.addPower(killer.id, 1, 'permanent')
    pushLog(ctx.state, ctx.controller, `${killer.name} devours ${victim.name} whole (+1 power).`)
  },
})
