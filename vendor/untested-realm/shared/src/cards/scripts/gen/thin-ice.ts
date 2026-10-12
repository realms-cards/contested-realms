import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { effAttack } from '../../../engine/statics'
import { awardAchievement } from '../../../engine/achievements.catalog'
import { submergeOrDrown } from '../multi-card-utils/submerge-or-drown'

// 'At the end of your turn, if minions atop this site total 5 or more power, submerge them.'
registerScript('Thin Ice', {
  endOfTurn: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const atop = unitsAt(ctx.state, self.x, self.y, 'surface').filter((u) => !u.isAvatar)
    const total = atop.reduce((n, u) => n + effAttack(ctx.state, u), 0)
    if (total < 5) return
    pushLog(ctx.state, ctx.controller, 'CRACK — the ice gives way!')
    if (!self.flooded) self.flooded = true
    const enemyIds = atop.filter((u) => u.controller !== ctx.controller).map((u) => u.id)
    for (const u of atop) submergeOrDrown(ctx, u)
    // Call of the siren — an enemy drowned through the ice with a Coy Nixie on/under it
    const enemyDrowned = enemyIds.some((id) => !ctx.state.units[id])
    const nixieHere = Object.values(ctx.state.units).some((u) => u.name === 'Coy Nixie' && u.x === self.x && u.y === self.y)
    if (enemyDrowned && nixieHere) awardAchievement(ctx.state, 'call-of-siren', ctx.controller)
  },
})
