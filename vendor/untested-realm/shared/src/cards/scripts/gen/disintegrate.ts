import { registerScript } from '../registry'

// 'Banish target minion nearby, and everything it carries.'
registerScript('Disintegrate', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target minion nearby' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    for (const artId of [...u.carrying]) {
      delete ctx.state.artifacts[artId]
    }
    u.carrying = []
    ctx.banish(u.id)
  },
})
