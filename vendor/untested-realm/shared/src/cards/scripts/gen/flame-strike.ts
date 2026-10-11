import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { inBounds, unitsAt } from '../../../engine/grid'
import { Dir } from '../multi-card-utils/apply-grid'

function rot(dx: number, dy: number, dir: Dir): { dx: number; dy: number } {
  switch (dir) {
    case 'n': return { dx, dy }
    case 's': return { dx: -dx, dy: -dy }
    case 'e': return { dx: dy, dy: -dx }
    case 'w': return { dx: -dy, dy: dx }
  }
}

// 'Choose a cardinal direction from the caster. Deal damage to each unit at
//  affected locations:'  grid (from the scan):  1 1 1 / _ 3 _ / _ ● _
registerScript('Flame Strike', {
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Flame Strike roars in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'roar')
  },
  conts: {
    roar: (ctx, _c, dir) => {
      const caster = ctx.caster!
      if (typeof dir !== 'string') return
      const cells = [
        { dx: 0, dy: 1, dmg: 3 },
        { dx: -1, dy: 2, dmg: 1 }, { dx: 0, dy: 2, dmg: 1 }, { dx: 1, dy: 2, dmg: 1 },
      ]
      for (const cell of cells) {
        const r = rot(cell.dx, cell.dy, dir as Dir)
        const x = caster.x + r.dx
        const y = caster.y + r.dy
        if (!inBounds(x, y)) continue
        for (const u of unitsAt(ctx.state, x, y, caster.region)) ctx.dealDamage({ unit: u.id }, cell.dmg)
      }
      pushLog(ctx.state, ctx.controller, '🔥 A tongue of flame scours the field!')
    },
  },
})
