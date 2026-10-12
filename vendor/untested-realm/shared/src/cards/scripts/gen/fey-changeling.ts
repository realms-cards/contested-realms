import { registerScript } from '../registry'

// 'May be summoned to any site. / Genesis â†’ You may return a minion here to its owner's hand.'
registerScript('Fey Changeling', {
  summonAnywhere: true,
  genesisTargets: [{ what: 'minion', count: 1, upTo: true, targeted: false, where: 'here', label: 'a minion here (optional)' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) {
      const self = ctx.state.units[ctx.sourceId]
      const u = ctx.state.units[t.unit]
      if (self && u && u.x === self.x && u.y === self.y) ctx.bounce(u.id)
    }
  },
})
