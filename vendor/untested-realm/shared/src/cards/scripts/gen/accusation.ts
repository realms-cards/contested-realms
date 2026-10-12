import { registerScript } from '../registry'
import { pushLog, revealHand } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'
import { isEvilCardFor } from '../multi-card-utils/is-evil-card-for'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Target opponent reveals their hand and banishes a card. If any of their cards
// or allies are Evil, you may choose which.'
registerScript('Accusation', {
  onCast: (ctx) => {
    const opp = (1 - ctx.controller) as PlayerId
    const p = ctx.state.players[opp]
    const names = p.hand.map((id) => ctx.state.cards[id].name)
    revealHand(ctx.state, opp, ctx.controller) // caster sees the hand face-up
    pushLog(ctx.state, ctx.controller, `${p.name} reveals their hand.`)
    // the opponent has now SEEN these cards (The Inquisition cares)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.revealedCards = [...new Set([...(ctx.state.flow.revealedCards ?? []), ...p.hand])]
    if (!names.length) return
    const anyEvil =
      names.some((n) => isEvilCardFor(ctx.state, opp, n)) ||
      Object.values(ctx.state.units).some((u) => u.controller === opp && !u.isAvatar && isEvilU(ctx.state, u))
    ctx.ask(
      { kind: 'chooseOption', title: 'Banish which card?', data: { options: [...new Set(names)] }, player: anyEvil ? ctx.controller : opp },
      'banishCard',
      { opp },
    )
  },
  conts: {
    banishCard: (ctx, contCtx, choice) => {
      const p = ctx.state.players[contCtx.opp as PlayerId]
      const idx = p.hand.findIndex((id) => ctx.state.cards[id].name === choice)
      if (idx >= 0) {
        const [id] = p.hand.splice(idx, 1)
        p.banished.push(id)
        pushLog(ctx.state, ctx.controller, `${choice} is banished.`)
      }
    },
  },
})
