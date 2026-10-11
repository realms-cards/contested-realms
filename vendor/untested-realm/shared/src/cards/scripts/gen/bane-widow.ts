import { registerScript } from '../registry'

// 'Genesis → May kill target minion here.'
registerScript('Bane Widow', {
  genesisTargets: [{ what: 'minion', count: 1, upTo: true, targeted: true, where: 'here', label: 'a minion here (optional)' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) {
      const self = ctx.state.units[ctx.sourceId]
      const u = ctx.state.units[t.unit]
      if (self && u && u.x === self.x && u.y === self.y && !u.isAvatar) ctx.kill(u.id)
    }
  },
})
