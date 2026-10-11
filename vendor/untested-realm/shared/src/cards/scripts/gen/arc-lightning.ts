import { registerScript } from '../registry'

// 'Deal 4 damage to target nearby unit.'
registerScript('Arc Lightning', {
  targets: [{ what: 'unit', count: 1, targeted: true, where: 'nearby', label: 'target nearby unit' }],
  onCast: (ctx) => ctx.dealDamage(ctx.targets[0], 4),
})
