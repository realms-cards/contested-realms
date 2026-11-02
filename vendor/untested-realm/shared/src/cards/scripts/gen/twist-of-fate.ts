import { registerScript } from '../registry'
import { emitEvent, pushLog } from '../../../engine/effects'
import type { GameState, UnitState } from '../../../engine/types'

// 'Exchange life totals with target opponent. (X) is the difference between your
// life totals.' — the cost IS the difference; castable only if you can pay it.
// An Avatar at Death's Door can't gain life, so it stays at Death's Door (0) while
// the other Avatar still takes its 0 and arrives at Death's Door.
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
    const mine = me.life ?? 0
    const theirs = them.life ?? 0
    ctx.spendMana(ctx.controller, Math.abs(mine - theirs))
    setExchangedLife(ctx.state, me, theirs)
    setExchangedLife(ctx.state, them, mine)
    pushLog(ctx.state, ctx.controller, `⚖ Fates twist: ${me.name} ${me.life} ⇄ ${them.name} ${them.life}.`)
  },
})

function setExchangedLife(state: GameState, avatar: UnitState, life: number): void {
  if (avatar.deathsDoor && life > (avatar.life ?? 0)) {
    pushLog(state, avatar.controller, `${avatar.name} is at death's door and cannot gain life.`)
    return
  }
  avatar.life = Math.max(0, life)
  if (avatar.life === 0 && !avatar.deathsDoor) {
    avatar.deathsDoor = true
    avatar.doorTurn = state.turn
    pushLog(state, null, `${avatar.name} is at death's door!`)
    emitEvent(state, 'onDeathsDoor', avatar)
  }
}
