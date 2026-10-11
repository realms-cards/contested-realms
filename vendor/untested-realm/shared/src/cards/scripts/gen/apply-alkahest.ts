import { registerScript } from '../registry'
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
    for (const u of unitsAt(ctx.state, site.x, site.y)) if (!u.isAvatar) ctx.kill(u.id)
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.x === site.x && a.y === site.y) ctx.breakArtifact(a.id)
    }
    for (const r of Object.values(ctx.state.auras)) {
      if (r.squares.some((s) => s.x === site.x && s.y === site.y)) {
        const card = ctx.state.cards[r.cardId]
        if (card) toCemetery(ctx.state, card.id)
        delete ctx.state.auras[r.id]
      }
    }
  },
})
