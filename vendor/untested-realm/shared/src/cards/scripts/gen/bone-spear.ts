import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Sacrifice an Undead to shoot a projectile from its location that deals 3 damage.'
registerScript('Bone Spear', {
  targets: [{
    what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an Undead to sacrifice',
    filter: (state, u) => hasSubtype(state, u, 'Undead'),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    ctx.ask({ kind: 'chooseOption', title: 'Fire the bone spear in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'spear', { from: { x: u.x, y: u.y }, region: u.region, sacId: u.id })
  },
  conts: {
    spear: (ctx, contCtx, dir) => {
      if (!dir) return
      ctx.kill(contCtx.sacId)
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: contCtx.from.x, oy: contCtx.from.y, region: contCtx.region,
        dir: String(dir), volleys: 1, damage: 3, filter: 'notStealth', srcName: 'Bone Spear',
      })
    },
  },
})
