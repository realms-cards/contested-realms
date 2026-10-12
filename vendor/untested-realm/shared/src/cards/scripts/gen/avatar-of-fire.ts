import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'Tap → This turn, fire sites in your hand are also Fireballs.'
registerScript('Avatar of Fire', {
  handSpellMorph: (state, player, cardName) => {
    if (state.flow?.fireballTurn?.[player] !== state.turn) return null
    const def = getCard(cardName)
    return def.type === 'Site' && def.thresholds.fire > 0 ? 'Fireball' : null
  },
  abilities: [{
    key: 'kindle',
    label: 'Tap → Fire sites in hand are also Fireballs this turn',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.fireballTurn = { ...(ctx.state.flow.fireballTurn ?? {}), [ctx.controller]: ctx.state.turn }
      pushLog(ctx.state, ctx.controller, 'The Avatar of Fire kindles the very land in your hand.')
    },
  }],
})
