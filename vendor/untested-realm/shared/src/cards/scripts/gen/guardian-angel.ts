import { registerScript } from '../registry'
import { getCard } from '../../db'
import { wardUnit } from '../../../engine/effects'
import { avgPow } from '../multi-card-utils/avg-pow'

// "weaker than THIS minion" Genesis filters run before it's on the board (the caster
// passed to validateTarget is the summoner), so measure against printed power.
const printedAvg = (name: string) => { const d = getCard(name); return Math.floor(((d.attack ?? 0) + (d.defence ?? 0)) / 2) }

// 'Airborne / Genesis → Fly to a weaker allied minion to Ward it.'
registerScript('Guardian Angel', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, owner: 'ally', label: 'a weaker allied minion',
    filter: (state, u, source) => {
      if (avgPow(state, u) >= printedAvg('Guardian Angel')) return false
      // FAQ1: "fly to" requires the target to be at a DIFFERENT location
      if (source && u.x === source.x && u.y === source.y && u.region === source.region) return false
      return true
    },
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const self = ctx.state.units[ctx.sourceId]
    const u = ctx.state.units[t.unit]
    if (!self || !u) return
    ctx.teleport(self.id, u.x, u.y, u.region)
    wardUnit(ctx.state, u) // helper enforces the Evil clause (was an inline subtype test that missed brands/Evil Twin)
  },
})
