import { registerScript } from '../registry'

// 'Give an allied unit +6 power this turn.'
registerScript('Gigantism', {
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an allied unit' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.addPower(t.unit, 6, 'endOfTurn')
  },
})
