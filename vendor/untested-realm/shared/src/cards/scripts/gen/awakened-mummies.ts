import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { fightUnits } from '../../../engine/combat'

// 'UPDATED: Summon Awakened Mummies burrowed safely. When an enemy unit moves
// onto the ground above them, they unburrow and fight.'
registerScript('Awakened Mummies', {
  mustSummonRegion: 'underground',
  selfKeywords: () => ['burrowing'], // 'burrowed safely'
  onUnitEntersSquare: (ctx, moved) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.region !== 'underground') return
    if (moved.controller === ctx.controller) return
    if (moved.x !== self.x || moved.y !== self.y || moved.region !== 'surface') return
    self.region = 'surface'
    const prey = ctx.state.units[moved.id]
    if (!prey) return
    pushLog(ctx.state, ctx.controller, 'The Mummies burst from the sand!')
    fightUnits(ctx.state, self, prey) // a real fight: both strike (fires Interrogator, Lethal, kill triggers…)
  },
})
