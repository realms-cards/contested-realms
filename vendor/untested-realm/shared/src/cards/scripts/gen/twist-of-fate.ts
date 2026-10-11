import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Exchange life totals with target opponent. (X) is the difference between your
// life totals.' — the cost IS the difference; castable only if you can pay it.
registerScript('Twist of Fate', {
  extraCastCheck: (state, player) => {
    const mine = Object.values(state.units).find((u) => u.isAvatar && u.controller === player)?.life ?? 0
    const theirs = Object.values(state.units).find((u) => u.isAvatar && u.controller !== player)?.life ?? 0
    const x = Math.abs(mine - theirs)
    return state.players[player].mana >= x ? null : `Twist of Fate costs (${x}) — the life difference.`
  },
  onCast: (ctx) => {
    const me = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
    const them = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller !== ctx.controller)
    if (!me || !them) return
    const x = Math.abs((me.life ?? 0) - (them.life ?? 0))
    ctx.spendMana(ctx.controller, x)
    const tmp = me.life
    me.life = them.life
    them.life = tmp
    pushLog(ctx.state, ctx.controller, `⚖ Fates twist: ${me.name} ${me.life} ⇄ ${them.name} ${them.life}.`)
  },
})
