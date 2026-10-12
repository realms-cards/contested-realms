import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { submergeOrDrown } from '../multi-card-utils/submerge-or-drown'

// 'At the end of your turn, you may submerge all minions and artifacts here.'
registerScript('Vatn Draconis', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    ctx.ask({ kind: 'yesNo', title: 'Vatn Draconis: drag everything here beneath the surface?' }, 'dive')
  },
  conts: {
    dive: (ctx, _c, yes) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!yes || !self) return
      // "everything here" = Vatn's OWN location (its region). Once Vatn has itself submerged (below), on
      // later turns it's underwater — it must NOT reach the surface units above it (a different location);
      // submerging things already in its region is a harmless no-op.
      for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) submergeOrDrown(ctx, u)
      for (const a of Object.values(ctx.state.artifacts)) {
        if (!a.carriedBy && a.x === self.x && a.y === self.y && a.region === self.region) a.region = 'underwater'
      }
      if (self.region === 'surface') self.region = 'underwater'
    },
  },
})
