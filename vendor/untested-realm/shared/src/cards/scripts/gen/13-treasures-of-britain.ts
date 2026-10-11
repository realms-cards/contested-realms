import { registerScript, type EffectAPI } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'
import { GRID_H, GRID_W, squareLabel } from '../../../engine/grid'

// "When picked up, bearer's controller draws a card. Teleport the Treasures to
//  the top of a random site or void."
registerScript('13 Treasures of Britain', {
  onPickedUp: (ctx, bearer) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    ctx.drawCard(bearer.controller)
    // then they slip to a random square → Kythera/Black Cat or Lucky Charm may bend it
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) spots.push({ x, y })
    const pick = ctx.lucky(spots.map((s) => ({ label: `${squareLabel(s.x, s.y)}`, payload: s })), 'slip', 'options', { artId: ctx.sourceId })
    if (pick !== undefined) treasuresSlip(ctx, ctx.sourceId, pick as { x: number; y: number })
  },
  conts: {
    slip: (ctx, c, choice) => treasuresSlip(ctx, c.artId as string, (c.__opts as { x: number; y: number }[])[luckyChoiceIndex(c, choice)]),
  },
})

function treasuresSlip(ctx: EffectAPI, artId: string, spot: { x: number; y: number }): void {
  const art = ctx.state.artifacts[artId]
  if (!art || !spot) return
  const bearer = art.carriedBy ? ctx.state.units[art.carriedBy] : null
  if (bearer) bearer.carrying = bearer.carrying.filter((id) => id !== artId)
  art.carriedBy = null
  art.x = spot.x
  art.y = spot.y
  art.region = 'surface'
  pushLog(ctx.state, ctx.controller, `The 13 Treasures vanish — and reappear at ${squareLabel(spot.x, spot.y)}!`)
}
