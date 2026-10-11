import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { GRID_H, GRID_W, isWaterSite, siteAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'
import { bodyOfWaterCells } from '../multi-card-utils/body-of-water'

const isWater = (state: GameState, x: number, y: number) => {
  const s = siteAt(state, x, y)
  return !!s && isWaterSite(state, s, getCard)
}

// 'This turn, your units can move between any sites in a chosen body of water
//  as if they were adjacent.'
registerScript('Marine Voyage', {
  onCast: (ctx) => {
    const waters: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (isWater(ctx.state, x, y)) waters.push({ x, y })
    if (!waters.length) return ctx.log('There is no water to sail.')
    ctx.ask({ kind: 'chooseSquare', title: 'Chart a voyage on which body of water?', data: { squares: waters } }, 'sail')
  },
  conts: {
    sail: (ctx, _c, sq) => {
      if (!sq) return
      const body = bodyOfWaterCells(ctx.state, sq.x, sq.y)
      if (body.length < 2) return ctx.log('That body of water leads nowhere.')
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.tempAdjacency = [
        ...(ctx.state.flow.tempAdjacency ?? []),
        { player: ctx.controller, turn: ctx.state.turn, squares: body },
      ]
      pushLog(ctx.state, ctx.controller, `The fleet sets sail — ${body.length} waters are as one this turn.`)
    },
  },
})
