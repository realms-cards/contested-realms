import { registerScript } from '../registry'
import { destroyTogether } from '../multi-card-utils/destroy-together'
import { unitsAt } from '../../../engine/grid'
import { toCemetery } from '../../../engine/effects'

// 'Destroy all minions, artifacts, and auras at target nearby site.'
registerScript('Apply Alkahest', {
  targets: [{ what: 'site', count: 1, targeted: true, where: 'nearby', label: 'target nearby site' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    destroyTogether(
      ctx,
      unitsAt(ctx.state, site.x, site.y).map((u) => u.id),
      Object.values(ctx.state.artifacts).filter((a) => a.x === site.x && a.y === site.y).map((a) => a.id),
    )
    for (const r of Object.values(ctx.state.auras)) {
      if (r.squares.some((s) => s.x === site.x && s.y === site.y)) {
        const card = ctx.state.cards[r.cardId]
        if (card) toCemetery(ctx.state, card.id)
        delete ctx.state.auras[r.id]
      }
    }
  },
})
