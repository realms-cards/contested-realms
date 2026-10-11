import { registerScript, type EffectAPI } from '../registry'
import { GRID_H, GRID_W, siteAt, squareLabel } from '../../../engine/grid'
import { luckyChoiceIndex } from '../../../engine/effects'

// 'Spellcaster, Voidwalk / At the start of your turn, Hauntless Head teleports to
// the top of a random site or void.'
registerScript('Hauntless Head', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const spots: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) spots.push({ x, y })
    // random destination → Kythera/Black Cat (choose any) or Lucky Charm (roll N+1, choose)
    const pick = ctx.lucky(spots.map((s) => ({ label: `${squareLabel(s.x, s.y)}`, payload: s })), 'drift')
    if (pick !== undefined) hauntlessDrift(ctx, pick as { x: number; y: number })
  },
  conts: {
    drift: (ctx, c, choice) => hauntlessDrift(ctx, (c.__opts as { x: number; y: number }[])[luckyChoiceIndex(c, choice)]),
  },
})

function hauntlessDrift(ctx: EffectAPI, spot: { x: number; y: number }): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || !spot) return
  const region = siteAt(ctx.state, spot.x, spot.y) ? 'surface' : 'void'
  ctx.teleport(self.id, spot.x, spot.y, region)
}
