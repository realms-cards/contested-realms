import { registerScript } from '../registry'

// 'An ally gains +3 power this turn and you heal 3.'
registerScript('Invigorate', {
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.addPower(t.unit, 3, 'endOfTurn')
    ctx.gainLife(ctx.controller, 3)
  },
})
