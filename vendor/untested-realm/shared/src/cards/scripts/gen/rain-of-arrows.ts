import { registerScript } from '../registry'

// 'Deal 1 damage to each aboveground minion.'
registerScript('Rain of Arrows', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && u.region === 'surface') ctx.dealDamage({ unit: u.id }, 1)
    }
  },
})
