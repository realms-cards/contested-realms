import { registerScript } from '../registry'
import { effAttack, effDefence } from '../../../engine/statics'
import { pushLog, tapUnit } from '../../../engine/effects'

// 'Whenever a player draws a card, that player taps their strongest untapped minion.'
registerScript('Chains of Prometheus', {
  onCardDrawn: (ctx, player) => {
    const mine = Object.values(ctx.state.units).filter((u) => u.controller === player && !u.isAvatar && !u.tapped)
    if (!mine.length) return
    const scored = mine.map((u) => ({ u, s: Math.floor((effAttack(ctx.state, u) + effDefence(ctx.state, u)) / 2) }))
    const max = Math.max(...scored.map((x) => x.s))
    const strongest = scored.filter((x) => x.s === max).map((x) => x.u)
    if (strongest.length === 1) {
      tapUnit(ctx.state, strongest[0])
      pushLog(ctx.state, player, `The Chains of Prometheus bind ${strongest[0].name}.`)
      return
    }
    // several tie for strongest → the DRAWING player chooses which of theirs is bound
    ctx.ask({ kind: 'chooseTargets', title: 'Chains of Prometheus: tap which of your strongest minions?', data: { candidates: strongest.map((u) => u.id), count: 1, upTo: false, kind: 'unit' }, player }, 'bind')
  },
  conts: {
    bind: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (u) { tapUnit(ctx.state, u); pushLog(ctx.state, u.controller, `The Chains of Prometheus bind ${u.name}.`) }
    },
  },
})
