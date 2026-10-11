import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'
import { takeControl } from '../multi-card-utils/take-control'

// 'Bearer has "Sacrifice Love Potion → Gain control of target enemy minion here
// until this unit leaves the realm."'
registerScript('Love Potion', {
  abilities: [{
    key: 'potion',
    label: 'Sacrifice → Charm an enemy minion here',
    cost: {},
    targets: [{ what: 'minion', count: 1, targeted: true, where: 'here', owner: 'enemy', label: 'target enemy minion here' }],
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      const t = ctx.targets[0]
      if (!art || !bearer || !t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u) return
      ctx.breakArtifact(art.id)
      takeControl(ctx.state, u, ctx.controller)
      // revert when the bearer leaves the realm
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.charms = [...(ctx.state.flow.charms ?? []), { unitId: u.id, anchorId: bearer.id, to: (1 - ctx.controller) as PlayerId }]
    },
  }],
})
