import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { swapSquares } from './site-move'

// 'Genesis → This site and an adjacent site change places, carrying along
// everything of normal size.'
registerScript('Atlas Wanderers', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const squares = [
      { x: self.x + 1, y: self.y }, { x: self.x - 1, y: self.y },
      { x: self.x, y: self.y + 1 }, { x: self.x, y: self.y - 1 },
    ].filter((s) => siteAt(ctx.state, s.x, s.y))
    if (!squares.length || !siteAt(ctx.state, self.x, self.y)) return
    ctx.ask({ kind: 'chooseSquare', title: 'Atlas Wanderers: this site trades places with which adjacent site?', data: { squares } }, 'wander', { hx: self.x, hy: self.y })
  },
  conts: {
    wander: (ctx, c, sq) => {
      if (!sq) return
      const here = { x: c.hx as number, y: c.hy as number }
      const adjacent = Math.abs(sq.x - here.x) + Math.abs(sq.y - here.y) === 1
      if (!adjacent || !siteAt(ctx.state, sq.x, sq.y) || !siteAt(ctx.state, here.x, here.y)) return
      if (swapSquares(ctx.state, here, sq, ctx.controller))
        pushLog(ctx.state, ctx.controller, 'The Atlas Wanderers heave the land itself into new places!')
    },
  },
})
