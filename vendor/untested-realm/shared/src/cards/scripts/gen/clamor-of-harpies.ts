import { registerScript } from '../registry'
import { getCard } from '../../db'
import { effAttack, effDefence } from '../../../engine/statics'
import { strikeOnce } from '../multi-card-utils/strike-once'

// 'Airborne / Genesis â†’ Teleport target weaker minion to this location.
// Clamor of Harpies may strike it.'
registerScript('Clamor of Harpies', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, label: 'target weaker minion',
    // "weaker" = weaker than Clamor of Harpies, which isn't on the board yet at
    // validation time (the caster passed here is the summoner), so use printed power
    filter: (state, u) => {
      const d = getCard('Clamor of Harpies')
      return Math.floor((effAttack(state, u) + effDefence(state, u)) / 2) < Math.floor(((d.attack ?? 0) + (d.defence ?? 0)) / 2)
    },
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const self = ctx.state.units[ctx.sourceId]
    const u = ctx.state.units[t.unit]
    if (!self || !u) return
    ctx.teleport(u.id, self.x, self.y, self.region)
    ctx.ask({ kind: 'yesNo', title: `Strike ${u.name}?` }, 'peck', { victim: u.id })
  },
  conts: {
    peck: (ctx, contCtx, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (choice && self && ctx.state.units[contCtx.victim]) strikeOnce(ctx, self, contCtx.victim)
    },
  },
})
