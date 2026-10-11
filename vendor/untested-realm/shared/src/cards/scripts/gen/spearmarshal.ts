import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Once on your turn, Spearmarshal may acquire a Lance token.'
registerScript('Spearmarshal', {
  abilities: [{
    key: 'requisition',
    label: 'Acquire a Lance',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name: 'Lance', owner: ctx.controller, isToken: true }
      const artId = `a${ctx.state.nextId++}`
      ctx.state.artifacts[artId] = {
        id: artId, cardId, name: 'Lance', conjuredBy: ctx.controller,
        x: self.x, y: self.y, region: self.region, carriedBy: self.id, tapped: false,
      }
      self.carrying.push(artId)
      pushLog(ctx.state, ctx.controller, 'The Spearmarshal takes up a fresh lance.')
    },
  }],
})
