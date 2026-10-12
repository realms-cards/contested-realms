import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Whenever another ally attacks an enemy adjacent to Sir Agravaine, he strikes
//  that enemy afterwards without losing Stealth.'
registerScript('Sir Agravaine', {
  afterAllyAttack: (ctx, _attacker, targetUnitId) => {
    const self = ctx.state.units[ctx.sourceId]
    const target = targetUnitId ? ctx.state.units[targetUnitId] : null
    if (!self || !target || target.controller === ctx.controller) return
    if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === target.x && s.y === target.y)) return
    const hadStealth = self.stealth
    ctx.strike(self, { unit: target.id })
    const still = ctx.state.units[self.id]
    if (still && hadStealth) still.stealth = true
    pushLog(ctx.state, ctx.controller, 'A blade flashes from the shadows — Sir Agravaine strikes unseen.')
  },
})
