import { registerScript } from '../registry'

// 'Give an ally Charge this turn.'
registerScript('Charge', {
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.grantKeyword(t.unit, 'charge', 'endOfTurn')
  },
})
