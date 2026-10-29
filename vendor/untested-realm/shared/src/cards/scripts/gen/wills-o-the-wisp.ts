import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { regionPresentAt } from '../../../engine/statics'

// ---------- attack responses ----------

// 'Whenever Wills-o'-the-Wisp are attacked, they may teleport to another nearby
//  location or void to evade the attack.'
// A nearby location is in their own region (Codex, Nearby): from a site's surface, another surface or
// a void; from underground, another underground or a void; from the void, another void. "May": they can
// stand instead.
registerScript("Wills-o'-the-Wisp", {
  onUnitAttacked: (ctx, target) => {
    if (target.id !== ctx.sourceId) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const squares = nearbySquaresW(ctx.state, self.x, self.y)
      .filter((s) => !(s.x === self.x && s.y === self.y))
      .filter((s) => !siteAt(ctx.state, s.x, s.y) || regionPresentAt(ctx.state, self.region, s.x, s.y))
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The Wisps flicker away — evade to where? (Esc to stand)', data: { squares, optional: true } }, 'flicker')
  },
  conts: {
    flicker: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq) return
      const region = siteAt(ctx.state, sq.x, sq.y) ? self.region : 'void'
      if (region !== 'void' && !regionPresentAt(ctx.state, region, sq.x, sq.y)) return
      if (ctx.teleport(self.id, sq.x, sq.y, region)) pushLog(ctx.state, ctx.controller, 'The Wisps scatter — the attack finds only empty air.')
    },
  },
})
