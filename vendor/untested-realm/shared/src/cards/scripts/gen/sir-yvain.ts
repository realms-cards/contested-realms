import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Lance. Genesis → Choose an allied Beast. Sir Yvain and his Beast companion
//  have +2 power while adjacent to each other.'
registerScript('Sir Yvain', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, owner: 'ally', label: 'an allied Beast',
    filter: (state, u) => effSubtypes(state, u).includes('Beast'),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !t || !('unit' in t)) return
    self.counters = { ...self.counters, companion: Number(t.unit.slice(1)) }
    pushLog(ctx.state, ctx.controller, `${ctx.state.units[t.unit]?.name} pads to Sir Yvain's side.`)
  },
  grantsPower: (state, self, other) => {
    const compId = self.counters?.companion !== undefined ? `u${self.counters.companion}` : null
    if (!compId) return 0
    const comp = state.units[compId]
    if (!comp) return 0
    const adjacent = orthAdjacentWrapped(state, self.x, self.y).some((s) => s.x === comp.x && s.y === comp.y)
    if (!adjacent) return 0
    return other.id === self.id || other.id === compId ? 2 : 0
  },
})
