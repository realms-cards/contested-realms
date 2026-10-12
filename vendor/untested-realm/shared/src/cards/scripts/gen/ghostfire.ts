import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Shoot a 1-damage projectile. / You may cast this spell from your cemetery,
// banishing it afterward.'
registerScript('Ghostfire', {
  castFromCemetery: { banishAfter: true },
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Ghostfire: which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'flame')
  },
  conts: {
    flame: (ctx, _c, dir) => {
      const caster = ctx.caster!
      if (!dir) return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
        dir: String(dir), volleys: 1, damage: 1, excludeId: caster.id, srcName: 'Ghostfire',
      })
    },
  },
})
