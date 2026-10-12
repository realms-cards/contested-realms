import { registerScript } from '../registry'

// 'Deal 1 damage to all enemy minions on the surface. You may cast this spell
// from your cemetery, banishing it afterward.'
registerScript('Murder of Crows', {
  castFromCemetery: { banishAfter: true },
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && u.controller !== ctx.controller && u.region === 'surface') {
        ctx.dealDamage({ unit: u.id }, 1)
      }
    }
  },
})
