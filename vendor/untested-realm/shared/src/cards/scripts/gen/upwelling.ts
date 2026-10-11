import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Target a nearby site. Return each artifact and minion there to its owner's hand.'
registerScript('Upwelling', {
  targets: [{ what: 'site', count: 1, targeted: true, where: 'nearby', label: 'target nearby site' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (!u.isAvatar) ctx.bounce(u.id)
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.carriedBy || a.x !== site.x || a.y !== site.y) continue
      const card = ctx.state.cards[a.cardId]
      if (card && !card.isToken) ctx.state.players[card.owner].hand.push(card.id)
      delete ctx.state.artifacts[a.id]
    }
    pushLog(ctx.state, ctx.controller, 'The upwelling sweeps the site clean.')
  },
})
