import { registerScript } from '../registry'

// 'Give an allied minion Airborne until your next turn. Draw a spell.'
registerScript('Power of Flight', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) {
      ctx.grantKeyword(t.unit, 'airborne', 'permanent')
      const u = ctx.state.units[t.unit]
      const m = u?.modifiers[u.modifiers.length - 1]
      if (m) m.duration = 'untilYourNextTurn' as any
    }
    ctx.draw(ctx.controller, 'spellbook')
  },
})
