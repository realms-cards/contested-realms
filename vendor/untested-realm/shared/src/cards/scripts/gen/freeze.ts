import { registerScript } from '../registry'

// 'Disable target nearby minion until your next turn.'
registerScript('Freeze', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (u) u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: ctx.state.turn, sourcePlayer: ctx.controller })
  },
})
