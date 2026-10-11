import { registerScript } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'

// 'Destroy everything.'
registerScript('Armageddon', {
  onCast: (ctx) => {
    pushLog(ctx.state, ctx.controller, '☄ ARMAGEDDON!')
    for (const u of Object.values(ctx.state.units)) if (!u.isAvatar) ctx.kill(u.id)
    for (const a of Object.values(ctx.state.artifacts)) ctx.breakArtifact(a.id)
    for (const r of Object.values(ctx.state.auras)) {
      const card = ctx.state.cards[r.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.auras[r.id]
    }
    for (const s of Object.values(ctx.state.sites)) {
      if (!s.isRubble) ctx.destroySite(s.id)
    }
  },
})
