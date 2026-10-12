import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Whenever a nearby Avatar draws a card, they lose life equal to the number of
// cards they've drawn this turn.'
registerScript('Iron Maiden', {
  onCardDrawn: (ctx, player) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === player)
    if (!avatar) return
    if (!nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === avatar.x && s.y === avatar.y)) return
    const drawn = ctx.state.flow?.drawsThisTurn?.[player] ?? 1
    ctx.loseLife(player, drawn)
    pushLog(ctx.state, player, `The Iron Maiden creaks shut (${drawn}).`)
  },
})
