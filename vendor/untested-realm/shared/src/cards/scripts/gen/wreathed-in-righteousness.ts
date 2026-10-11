import { registerScript } from '../registry'
import { pushLog, wardUnit } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Ward all minions at target location. Then deal damage to minions at
//  affected locations:'  grid (from the scan): 2 2 2 / 2 0 2 / 2 2 2 (0 = target)
registerScript('Wreathed in Righteousness', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('square' in t)) return
    const { x, y } = t.square
    const region = t.square.region ?? 'surface'
    for (const u of unitsAt(ctx.state, x, y, region)) {
      if (!u.isAvatar) wardUnit(ctx.state, u)
    }
    for (const s of nearbySquaresW(ctx.state, x, y)) {
      if (s.x === x && s.y === y) continue
      for (const u of unitsAt(ctx.state, s.x, s.y, region)) {
        if (!u.isAvatar) ctx.dealDamage({ unit: u.id }, 2)
      }
    }
    pushLog(ctx.state, ctx.controller, 'Cleansing flame wreathes the righteous — and burns the rest.')
  },
})
