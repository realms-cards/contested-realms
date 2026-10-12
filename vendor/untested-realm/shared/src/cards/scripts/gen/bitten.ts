import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Genesis → Strike target nearby Evil minion. / Deathrite → Summon a Skeleton
// token here under your opponent's control.'
registerScript('Bitten', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'nearby', label: 'target nearby Evil minion',
    filter: (state, u) => isEvilU(state, u),
  }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (self && t && 'unit' in t && ctx.state.units[t.unit]) ctx.strike(self, { unit: t.unit })
  },
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) ctx.summonToken('Skeleton', (1 - ctx.controller) as PlayerId, self.x, self.y)
  },
})
