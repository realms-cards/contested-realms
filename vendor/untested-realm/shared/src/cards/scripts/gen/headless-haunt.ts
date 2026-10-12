import { registerScript, type EffectAPI } from '../registry'
import { GRID_H, GRID_W, siteAt, squareLabel } from '../../../engine/grid'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'

// 'Voidwalk / At the start of your turn, Headless Haunt teleports to the top of a
// random site or void.'
registerScript('Headless Haunt', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) spots.push({ x, y })
    // random destination â†’ Kythera/Black Cat (choose any) or Lucky Charm (roll N+1, choose)
    const pick = ctx.lucky(spots.map((s) => ({ label: `${squareLabel(s.x, s.y)}`, payload: s })), 'haunt')
    if (pick !== undefined) hauntDrift(ctx, pick as { x: number; y: number })
  },
  conts: {
    haunt: (ctx, c, choice) => hauntDrift(ctx, (c.__opts as { x: number; y: number }[])[luckyChoiceIndex(c, choice)]),
  },
})

function hauntDrift(ctx: EffectAPI, spot: { x: number; y: number }): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || !spot) return
  const region = siteAt(ctx.state, spot.x, spot.y) ? 'surface' : 'void'
  ctx.teleport(self.id, spot.x, spot.y, region)
  pushLog(ctx.state, ctx.controller, 'The Headless Haunt drifts somewhere new.')
}
