import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { lend } from '../multi-card-utils/lend'

// 'Any time during your turn, you may look at your next spell. / You may cast
//  Dragons from the top of your spellbook here for (1) less.'
registerScript('Cradle of Etherrum', {
  abilities: [{
    key: 'peek',
    label: 'Look at your next spell',
    cost: {},
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      const top = p.spellbook[0]
      if (top === undefined) return ctx.log('The spellbook is empty.')
      ctx.ask({ kind: 'chooseOption', title: `Next spell: ${ctx.state.cards[top].name}.`, data: { options: ['ok'] } }, 'noop')
    },
  }, {
    key: 'hatch',
    label: 'Cast the top Dragon here (−①)',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      const p = ctx.state.players[ctx.controller]
      const top = p.spellbook[0]
      if (top === undefined) return ctx.log('The spellbook is empty.')
      const name = ctx.state.cards[top].name
      const def = getCard(name)
      if (def.type !== 'Minion' || !def.subtypes.includes('Dragon')) return ctx.log(`${name} is no Dragon.`)
      p.spellbook.shift()
      lend(ctx, top, 'spellbookTop', ctx.controller)
      ctx.state.flow.castAtOnly = [...(ctx.state.flow.castAtOnly ?? []), { cardId: top, x: art.x, y: art.y }]
      ctx.state.flow.spellDiscounts = [
        ...(ctx.state.flow.spellDiscounts ?? []),
        { player: ctx.controller, turn: ctx.state.turn, amount: 1, subtype: 'Dragon', at: { x: art.x, y: art.y } },
      ]
      pushLog(ctx.state, ctx.controller, `${name} stirs in the Cradle — cast it here this turn.`)
    },
  }],
  conts: { noop: () => {} },
})
