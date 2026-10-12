import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'Teleport any number of allies at one location to another location a chess
// knight's move away. Draw a card.'
registerScript('Flanking Maneuver', {
  targets: [
    { what: 'square', count: 1, targeted: false, label: 'the allies\' location' },
    { what: 'square', count: 1, targeted: false, label: "a knight's move away" },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!('square' in t1) || !('square' in t2)) return
    const dx = Math.abs(t1.square.x - t2.square.x)
    const dy = Math.abs(t1.square.y - t2.square.y)
    if (!((dx === 1 && dy === 2) || (dx === 2 && dy === 1))) return ctx.log("That is not a knight's move.")
    const srcRegion = t1.square.region ?? 'surface'
    const dstRegion = t2.square.region ?? srcRegion
    for (const u of unitsAt(ctx.state, t1.square.x, t1.square.y, srcRegion)) {
      if (u.controller === ctx.controller) ctx.teleport(u.id, t2.square.x, t2.square.y, dstRegion)
    }
    ctx.drawCard(ctx.controller)
  },
})
