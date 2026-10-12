import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Minions here have "Tap → Gain (1)."'
registerScript('Homecoming', {
  auraGrantsAbilities: (state, aura, unit) => {
    if (unit.isAvatar || unit.region !== 'surface') return []
    if (!aura.squares.some((s) => s.x === unit.x && s.y === unit.y)) return []
    return [{
      key: 'homecoming:gain',
      label: 'Homecoming: Tap → Gain ①',
      cost: { tap: true },
      effect: (ctx) => {
        ctx.state.players[ctx.controller].mana += 1
        pushLog(ctx.state, ctx.controller, 'Homecoming: gained ①.')
      },
    }]
  },
})
