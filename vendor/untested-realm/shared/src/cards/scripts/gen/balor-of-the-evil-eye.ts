import { registerScript } from '../registry'
import { fireEvilEyeGaze, gazeReach } from '../../../engine/combat'

// 'Once on your turn, Balor may deal 2 damage to one unit at each other location
// in a cardinal direction.' (Balor's controller picks when a location holds several)
registerScript('Balor of the Evil Eye', {
  abilities: [{
    key: 'gaze',
    label: 'Open the Evil Eye (2 dmg along a direction)',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      // the preview lanes run the whole line: voids and blocking sites don't stop the gaze
      const lanes = self ? { from: { x: self.x, y: self.y }, dirs: gazeReach(ctx.state, self.x, self.y) } : {}
      ctx.ask({ kind: 'chooseOption', title: 'Gaze in which direction?', data: { options: ['n', 's', 'e', 'w'], ...lanes } }, 'gaze')
    },
  }],
  conts: {
    gaze: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      // 2 damage to one unit at EACH OTHER location in the direction — every square along the line,
      // and at each the surface AND subsurface of sites AS WELL AS the void (FAQ). Balor's controller
      // picks when several units share a location. The gaze is not a projectile: it ignores region
      // edges, voids, projectile-blocking sites and Stealth.
      fireEvilEyeGaze(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y,
        dir: String(dir), damage: 2, excludeId: self.id, srcName: 'Balor of the Evil Eye',
      })
    },
  },
})
