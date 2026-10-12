import { registerScript } from '../registry'

// 'Deal 7 damage to target minion nearby.'
registerScript('Immolation', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target minion nearby' }],
  onCast: (ctx) => ctx.dealDamage(ctx.targets[0], 7),
})
