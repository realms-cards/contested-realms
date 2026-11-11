import { registerScript } from '../registry'
import { untapUnit } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'At the end of your turn, untap all nearby allies.' (artifact)
registerScript('Belfry', {
  endOfTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    for (const u of Object.values(ctx.state.units)) {
      // "nearby allies" don't cross a regional boundary: a Belfry on a site skips allies in a nearby void (Codex)
      if (u.controller !== ctx.controller || u.region !== art.region) continue
      if (nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === u.x && s.y === u.y)) untapUnit(ctx.state, u)
    }
  },
})
