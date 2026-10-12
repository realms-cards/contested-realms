import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { avgPow } from '../multi-card-utils/avg-pow'

// 'Once on your turn, you may banish minions with 2 or less power at target
// adjacent location.'
registerScript('Golgor', {
  abilities: [{
    key: 'maw',
    label: 'Devour the small (banish ≤2 power adjacent)',
    cost: {},
    oncePerTurn: true,
    targets: [{ what: 'square', count: 1, targeted: true, label: 'target adjacent location' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('square' in t)) return
      if (!adjacentSquaresW(ctx.state, self.x, self.y).some((s) => s.x === t.square.x && s.y === t.square.y)) return ctx.log('Not adjacent.')
      const region = t.square.region ?? self.region
      for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
        if (!u.isAvatar && avgPow(ctx.state, u) <= 2) ctx.banish(u.id)
      }
    },
  }],
})
