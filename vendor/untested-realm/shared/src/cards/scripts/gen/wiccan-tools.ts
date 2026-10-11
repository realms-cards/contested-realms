import { registerScript } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'

// 'Sacrifice → Draw a spell. This turn, bearer gains Spellcaster and their
//  spells require no threshold.'
registerScript('Wiccan Tools', {
  abilities: [{
    key: 'rite',
    label: 'Sacrifice → Draw; bearer casts freely this turn',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer) return ctx.log('No one holds the tools.')
      ctx.draw(ctx.controller, 'spellbook')
      ctx.grantKeyword(bearer.id, 'spellcaster', 'endOfTurn')
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.noThreshold = { ...(ctx.state.flow.noThreshold ?? {}), [ctx.controller]: ctx.state.turn }
      const card = ctx.state.cards[art.cardId]
      bearer.carrying = bearer.carrying.filter((id) => id !== art.id)
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.artifacts[art.id]
      pushLog(ctx.state, ctx.controller, 'The Wiccan Tools are spent in one great working.')
    },
  }],
})
