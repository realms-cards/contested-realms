import { registerScript } from '../registry'
import { pushLog, killUnit, checkStateBased, toCemetery } from '../../../engine/effects'

// 'When the Roots of Yggdrasil are destroyed, destroy everything.'
registerScript('Roots of Yggdrasil', {
  onSelfDestroyed: (ctx) => {
    pushLog(ctx.state, null, '🌳 THE WORLD-TREE FALLS. EVERYTHING FOLLOWS.')
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar) killUnit(ctx.state, u.id)
    }
    for (const a of Object.values(ctx.state.artifacts)) ctx.breakArtifact(a.id)
    for (const r of Object.values(ctx.state.auras)) {
      const card = ctx.state.cards[r.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.auras[r.id]
    }
    for (const s of Object.values(ctx.state.sites)) {
      if (!s.isRubble) ctx.destroySite(s.id)
    }
    checkStateBased(ctx.state)
  },
})
