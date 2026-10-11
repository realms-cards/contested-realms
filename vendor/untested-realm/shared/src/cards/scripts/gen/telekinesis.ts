import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Caster snatches and picks up target nearby artifact they can carry.'
registerScript('Telekinesis', {
  // 'they can carry' — automatons (artifact minions) are not carriable
  targets: [{ what: 'artifact', count: 1, targeted: true, label: 'target nearby artifact', filter: (state, cand) => !!state.artifacts[cand?.id] }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    const caster = ctx.caster!
    if (!t || !('artifact' in t)) return
    const art = ctx.state.artifacts[t.artifact]
    if (!art) return
    if (!nearbySquaresW(ctx.state, caster.x, caster.y).some((s) => s.x === art.x && s.y === art.y)) return ctx.log('Not nearby.')
    if (art.carriedBy) {
      const holder = ctx.state.units[art.carriedBy]
      if (holder) holder.carrying = holder.carrying.filter((id) => id !== art.id)
    }
    art.carriedBy = caster.id
    art.x = caster.x
    art.y = caster.y
    art.region = caster.region
    caster.carrying.push(art.id)
    pushLog(ctx.state, ctx.controller, `${art.name} flies into ${caster.name}'s grasp.`)
  },
})
