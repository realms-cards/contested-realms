import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { pushLog, wardUnit } from '../../../engine/effects'

// 'Genesis → Steal a nearby Ward.'
registerScript('Heretics of Seth', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.ward) return
    // every nearby Ward — on a unit OR a site — is a candidate; the player picks which to
    // steal when more than one is in reach (never an arbitrary first-found grab).
    const candidates: string[] = []
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) {
        if (u.ward && u.id !== self.id) candidates.push(u.id)
      }
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site?.ward) candidates.push(site.id)
    }
    if (candidates.length === 0) return
    if (candidates.length === 1) return heretickSteal(ctx, candidates[0])
    ctx.ask({ kind: 'chooseTargets', title: 'Heretics: steal which nearby Ward?', data: { candidates, count: 1, upTo: false, kind: 'unitOrSite' } }, 'stealWard')
  },
  conts: {
    stealWard: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') heretickSteal(ctx, id)
    },
  },
})

function heretickSteal(ctx: EffectAPI, id: string) {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || self.ward) return
  const u = ctx.state.units[id]
  const site = ctx.state.sites[id]
  // helper enforces the Evil clause on the thief; only strip the source if the theft lands
  if (u?.ward && u.id !== self.id) {
    if (wardUnit(ctx.state, self)) { u.ward = false; pushLog(ctx.state, ctx.controller, `The Heretics steal ${u.name}'s ward!`) }
  } else if (site?.ward) {
    if (wardUnit(ctx.state, self)) { site.ward = false; pushLog(ctx.state, ctx.controller, `The Heretics steal ${site.name}'s ward!`) }
  }
}
