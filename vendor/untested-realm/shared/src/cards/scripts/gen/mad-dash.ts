import { registerScript } from '../registry'

// 'Draw a card, then give an ally Movement +1 this turn.'
registerScript('Mad Dash', {
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    ctx.drawCard(ctx.controller)
    const t = ctx.targets[0]
    if ('unit' in t) ctx.grantKeyword(t.unit, 'movement +1', 'endOfTurn')
  },
})
