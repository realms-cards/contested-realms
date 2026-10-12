import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'
import { pushLog, checkStateBased, moveProtected } from '../../../engine/effects'

// 'Each burrowed ally may drag down a target minion or artifact above them.'
registerScript('Grasping Ground', {
  onCast: (ctx) => {
    const diggers = Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller && u.region === 'underground')
    for (const digger of diggers) {
      // a "can't be moved by force" enemy (Iron Man Talus, Talamh Dreig…) resists being dragged under
      const above = unitsAt(ctx.state, digger.x, digger.y, 'surface')
        .filter((u) => !u.isAvatar && !(u.controller !== ctx.controller && moveProtected(ctx.state, u)))
        .map((u) => u.id)
      if (above.length) {
        ctx.ask(
          { kind: 'chooseTargets', title: `${digger.name}: drag down whom?`, data: { candidates: above, count: 1, upTo: true, kind: 'unit' } },
          'dragDown',
        )
      }
    }
  },
  conts: {
    dragDown: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = id ? ctx.state.units[id] : null
      if (u && terrainAt(ctx.state, u.x, u.y) === 'land') {
        u.region = 'underground'
        pushLog(ctx.state, ctx.controller, `${u.name} is dragged into the earth!`)
        checkStateBased(ctx.state)
      }
    },
  },
})
