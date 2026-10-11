import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, killUnit } from '../../../engine/effects'

// 'Destroy everything Unique or Elite in the realm.'
registerScript('Peasant Revolt', {
  onCast: (ctx) => {
    const posh = (n: string) => ['Unique', 'Elite'].includes(getCard(n).rarity ?? '')
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && posh(u.name)) killUnit(ctx.state, u.id)
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (posh(a.name)) ctx.breakArtifact(a.id)
    }
    for (const s of Object.values(ctx.state.sites)) {
      if (!s.isRubble && posh(s.name)) ctx.destroySite(s.id)
    }
    pushLog(ctx.state, ctx.controller, 'The peasants are revolting!')
  },
})
