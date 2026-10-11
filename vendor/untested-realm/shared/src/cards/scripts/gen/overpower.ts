import { registerScript } from '../registry'

// 'Give an ally +2 power this turn.'  (no "target" → not region-locked)
registerScript('Overpower', {
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.addPower(t.unit, 2, 'endOfTurn')
  },
})
