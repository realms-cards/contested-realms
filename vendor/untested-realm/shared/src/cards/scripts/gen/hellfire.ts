import { registerScript } from '../registry'
import { pushLog, killUnit } from '../../../engine/effects'

// 'Destroy everything below sites, then deal 2 damage to each minion above.'
registerScript('Hellfire', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && (u.region === 'underground' || u.region === 'underwater')) killUnit(ctx.state, u.id)
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.region === 'underground' || a.region === 'underwater') ctx.breakArtifact(a.id)
    }
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && u.region === 'surface') ctx.dealDamage({ unit: u.id }, 2)
    }
    pushLog(ctx.state, ctx.controller, 'Hellfire erupts from below!')
  },
})
