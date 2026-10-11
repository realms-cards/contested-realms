import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { GRID_H, GRID_W, isWaterSite, siteAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'
import { connected } from '../multi-card-utils/connected'

const isLand = (state: GameState, x: number, y: number) => {
  const s = siteAt(state, x, y)
  return !!s && !isWaterSite(state, s, getCard) // the land analog of a body of water (canonical water check)
}

// 'This turn, your units can move between any sites in a chosen span of land
//  as if they were adjacent.'
registerScript('Minecart Madness', {
  onCast: (ctx) => {
    const lands: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (isLand(ctx.state, x, y)) lands.push({ x, y })
    if (!lands.length) return ctx.log('No land for the rails.')
    ctx.ask({ kind: 'chooseSquare', title: 'Lay track through which span of land?', data: { squares: lands } }, 'ride')
  },
  conts: {
    ride: (ctx, _c, sq) => {
      if (!sq) return
      const span = connected(ctx.state, sq.x, sq.y, (x, y) => isLand(ctx.state, x, y))
      if (span.length < 2) return ctx.log('The track leads nowhere.')
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.tempAdjacency = [
        ...(ctx.state.flow.tempAdjacency ?? []),
        { player: ctx.controller, turn: ctx.state.turn, squares: span },
      ]
      pushLog(ctx.state, ctx.controller, `🛤 WHEEE — ${span.length} sites are linked by rail this turn.`)
    },
  },
})
