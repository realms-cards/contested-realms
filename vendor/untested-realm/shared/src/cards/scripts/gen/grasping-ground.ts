import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'
import { pushLog, checkStateBased, moveProtected } from '../../../engine/effects'
import { syncCarried } from '../../../engine/carrying'

// 'Each burrowed ally may drag down a target minion or artifact above them.'
registerScript('Grasping Ground', {
  onCast: (ctx) => {
    const diggers = Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller && u.region === 'underground')
    for (const digger of diggers) {
      // a "can't be moved by force" enemy (Iron Man Talus, Talamh Dreig…) resists being dragged under;
      // "target": an enemy's Stealth hides it from targeting (as a targeted TargetSpec does)
      const above = unitsAt(ctx.state, digger.x, digger.y, 'surface')
        .filter((u) => !u.isAvatar && !moveProtected(ctx.state, u, ctx.controller) && !(u.stealth && u.controller !== ctx.controller))
        .map((u) => u.id)
      // "or artifact": one lying on the ground above them
      const arts = Object.values(ctx.state.artifacts)
        .filter((a) => !a.carriedBy && a.x === digger.x && a.y === digger.y && a.region === 'surface')
        .map((a) => a.id)
      const cands = [...above, ...arts]
      if (cands.length) {
        ctx.ask(
          { kind: 'chooseTargets', title: `${digger.name}: drag down what?`, data: { candidates: cands, count: 1, upTo: true, kind: 'unit' } },
          'dragDown',
        )
      }
    }
  },
  conts: {
    dragDown: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id !== 'string') return
      const art = ctx.state.artifacts[id]
      if (art && !art.carriedBy && art.region === 'surface' && terrainAt(ctx.state, art.x, art.y) === 'land') {
        art.region = 'underground'
        pushLog(ctx.state, ctx.controller, `${art.name} is dragged into the earth!`)
        return
      }
      const u = ctx.state.units[id]
      if (u && terrainAt(ctx.state, u.x, u.y) === 'land') {
        u.region = 'underground'
        syncCarried(ctx.state, u) // what it carries goes down with it
        pushLog(ctx.state, ctx.controller, `${u.name} is dragged into the earth!`)
        checkStateBased(ctx.state)
      }
    },
  },
})
