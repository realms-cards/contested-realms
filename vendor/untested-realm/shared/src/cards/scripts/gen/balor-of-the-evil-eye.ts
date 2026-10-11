import { registerScript } from '../registry'
import { fireEvilEyeGaze } from '../../../engine/combat'

// 'Once on your turn, Balor may deal 2 damage to one unit at each other location
// in a cardinal direction.' (auto-picks enemies first at each square)
registerScript('Balor of the Evil Eye', {
  abilities: [{
    key: 'gaze',
    label: 'Open the Evil Eye (2 dmg along a direction)',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Gaze in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'gaze')
    },
  }],
  conts: {
    gaze: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      // 2 damage to one unit at EACH OTHER location in the direction — every square along the ray,
      // and at each the surface AND subsurface of sites AS WELL AS the void (FAQ). Shooter-chosen
      // when several units share a location. The gaze pierces region edges (it is not a moving
      // projectile that stops at the void).
      fireEvilEyeGaze(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y,
        dir: String(dir), damage: 2, filter: 'notStealth', excludeId: self.id, srcName: 'Balor of the Evil Eye',
      })
    },
  },
})
