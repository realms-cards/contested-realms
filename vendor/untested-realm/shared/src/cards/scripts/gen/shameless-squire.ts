import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Tap target nearby enemy. It drops everything it's carrying.'
registerScript('Shameless Squire', {
  genesisTargets: [{ what: 'unit', count: 1, upTo: true, targeted: true, where: 'nearby', owner: 'enemy', label: 'target nearby enemy' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const foe = ctx.state.units[t.unit]
    if (!foe) return
    foe.tapped = true
    for (const artId of [...foe.carrying]) {
      const art = ctx.state.artifacts[artId]
      if (art) {
        art.carriedBy = null
        art.x = foe.x
        art.y = foe.y
      }
    }
    foe.carrying = []
    pushLog(ctx.state, ctx.controller, `${foe.name} is tripped and drops everything!`)
  },
})
