import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Whenever an enemy attacks Bridge Troll, they must spend all of their
//  remaining mana to give to you on your next turn.'
registerScript('Bridge Troll', {
  onUnitAttacked: (ctx, target, attacker) => {
    if (target.id !== ctx.sourceId) return
    const foe = ctx.state.players[attacker.controller]
    if (foe.mana <= 0) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.manaGift = ctx.state.flow.manaGift ?? { 0: 0, 1: 0 }
    ctx.state.flow.manaGift[ctx.controller] += foe.mana
    pushLog(ctx.state, ctx.controller, `The Bridge Troll extorts ${foe.mana} mana as toll!`)
    foe.mana = 0
  },
})
