import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Take target nearby artifact that can be carried and hide it beneath this site.'
registerScript('Frisky Red Squirrel', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || terrainAt(ctx.state, self.x, self.y) === 'void') return
    const candidates = Object.values(ctx.state.artifacts)
      .filter((a) => nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === a.x && s.y === a.y))
      .filter((a) => !getCard(a.name).subtypes.includes('Monument') && !getCard(a.name).subtypes.includes('Automaton'))
      .map((a) => a.id)
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Squirrel away which artifact?', data: { candidates, count: 1, upTo: true, kind: 'unit' } }, 'stash')
  },
  conts: {
    stash: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const art = id ? ctx.state.artifacts[id] : null
      if (!art || !self) return
      if (art.carriedBy) {
        const carrier = ctx.state.units[art.carriedBy]
        if (carrier) carrier.carrying = carrier.carrying.filter((x) => x !== art.id)
        art.carriedBy = null
      }
      art.x = self.x
      art.y = self.y
      art.region = terrainAt(ctx.state, self.x, self.y) === 'water' ? 'underwater' : 'underground'
      pushLog(ctx.state, ctx.controller, `${art.name} is squirreled away below.`)
    },
  },
})
