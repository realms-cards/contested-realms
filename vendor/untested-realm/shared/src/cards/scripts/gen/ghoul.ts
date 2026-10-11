import { registerScript, getScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// graft the lingering Ghouls' extra deathrite onto the Ghoul script
{
  const ghoul = getScript('Ghoul') ?? {}
  const original = ghoul.deathrite
  ghoul.deathrite = (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self?.counters?.lingering && siteAt(ctx.state, self.x, self.y)) {
      const before = new Set(Object.keys(ctx.state.units))
      ctx.summonToken('Skeleton', ctx.controller, self.x, self.y)
      // tag the raised Skeleton so the "Linger that!" achievement can trace the lineage
      for (const id of Object.keys(ctx.state.units)) {
        const su = ctx.state.units[id]
        if (!before.has(id) && su.name === 'Skeleton') su.counters = { ...su.counters, lingerSkel: 1 }
      }
      pushLog(ctx.state, ctx.controller, 'And still, something lingers…')
    }
    original?.(ctx)
  }
  if (!getScript('Ghoul')) registerScript('Ghoul', ghoul)
}
