import { registerScript } from '../registry'

// 'Kill target wounded minion.'
registerScript('Fatality', {
  targets: [{
    what: 'minion', count: 1, targeted: true, label: 'target wounded minion',
    filter: (state, u) => u.damage > 0,
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.kill(t.unit)
  },
})
