import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Once on your turn, the Overseer may deal 1 damage to target adjacent Ordinary
// minion to untap it.'
registerScript('Cranky Overseer', {
  abilities: [{
    key: 'whip',
    label: 'Whip an adjacent Ordinary minion awake',
    cost: {},
    oncePerTurn: true,
    targets: [{
      what: 'minion', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent Ordinary minion',
      filter: (state, u) => getCard(u.name).rarity === 'Ordinary',
    }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (!('unit' in t)) return
      ctx.dealDamage({ unit: t.unit }, 1)
      const u = ctx.state.units[t.unit]
      if (u) u.tapped = false
    },
  }],
})
