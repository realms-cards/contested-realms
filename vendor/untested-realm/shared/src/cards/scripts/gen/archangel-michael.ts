import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { strikeAllSimultaneous, emitUnitMoved } from '../../../engine/effects'

// 'Airborne, Ward / Genesis → Michael takes a step, then strikes all enemies at his location.'
registerScript('Archangel Michael', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // "takes a step" — only legal steps (Michael is Airborne, so surface diagonals are fine; walls /
    // entry-bans / Immobile still block him).
    const options = nearbySquaresW(ctx.state, self.x, self.y)
      .filter((s) => !(s.x === self.x && s.y === self.y) && siteAt(ctx.state, s.x, s.y) &&
        isLegalStep(ctx.state, self, { x: self.x, y: self.y, region: self.region }, { x: s.x, y: s.y, region: 'surface' }))
      .map((s) => siteAt(ctx.state, s.x, s.y)!.id)
    if (!options.length) return michaelSmite(ctx)
    ctx.ask({ kind: 'chooseTargets', title: 'Michael steps to which site (or skip)?', data: { candidates: options, count: 1, upTo: true, kind: 'site' } }, 'step')
  },
  conts: {
    step: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const site = id ? ctx.state.sites[id] : null
      if (self && site) {
        const from = { x: self.x, y: self.y, region: self.region }
        const to = { x: site.x, y: site.y, region: 'surface' as const }
        if (isLegalStep(ctx.state, self, from, to)) { self.x = site.x; self.y = site.y; self.region = 'surface'; emitUnitMoved(ctx.state, self, from) }
      }
      michaelSmite(ctx)
    },
  },
})

function michaelSmite(ctx: EffectAPI) {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const foes = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.controller !== ctx.controller).map((u) => u.id)
  strikeAllSimultaneous(ctx.state, self.id, foes, ctx.controller) // controller chooses strike order
}
