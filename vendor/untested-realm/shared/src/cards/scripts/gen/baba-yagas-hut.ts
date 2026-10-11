import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { GRID_H, GRID_W, siteAt, isSiteEmpty, squareLabel } from '../../../engine/grid'
import { swapSquares } from './site-move'

// 'Once on your turn, this may swap positions with an empty site in your back row.'
registerScript("Baba Yaga's Hut", {
  abilities: [{
    key: 'walk',
    label: 'Swap with an empty back-row site',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const hut = ctx.state.sites[ctx.sourceId]
      if (!hut) return
      const backY = ctx.controller === 0 ? 0 : GRID_H - 1
      const squares: { x: number; y: number }[] = []
      for (let x = 0; x < GRID_W; x++) {
        const s = siteAt(ctx.state, x, backY)
        if (!s || s.id === hut.id || s.isRubble) continue
        // "an empty site" — nothing on it: no units (any region, incl. a face-down card), artifacts or auras
        if (isSiteEmpty(ctx.state, x, backY)) squares.push({ x, y: backY })
      }
      if (!squares.length) return ctx.log('No empty site in your back row.')
      ctx.ask({ kind: 'chooseSquare', title: 'The hut strides… swap with which back-row site?', data: { squares } }, 'walk')
    },
  }],
  conts: {
    walk: (ctx, _c, sq) => {
      const hut = ctx.state.sites[ctx.sourceId]
      if (!hut || !sq) return
      const backY = ctx.controller === 0 ? 0 : GRID_H - 1
      const target = siteAt(ctx.state, sq.x, sq.y)
      if (!target || target.isRubble || sq.y !== backY || !isSiteEmpty(ctx.state, sq.x, sq.y)) return
      if (swapSquares(ctx.state, { x: hut.x, y: hut.y }, sq, ctx.controller))
        pushLog(ctx.state, ctx.controller, `Baba Yaga's Hut strides to ${squareLabel(sq.x, sq.y)} on its chicken legs!`)
    },
  },
})
