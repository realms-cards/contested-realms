import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Avatars nearby have "Discard a card → Gain control of Seasoned Sellsword."'
registerScript('Seasoned Sellsword', {
  grantsAbilities: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || !unit.isAvatar) return []
    if (!nearbySquaresW(state, self.x, self.y).some((s) => s.x === unit.x && s.y === unit.y)) return []
    if (unit.controller === self.controller) return []
    return [{
      key: 'sellsword:hire',
      label: 'Discard a card → Hire the Seasoned Sellsword',
      cost: { discardSpell: true },
      effect: (ctx) => {
        const sword = ctx.state.units[selfId] // THIS Sellsword (grants the ability), not whichever copy is first
        if (sword && sword.controller !== ctx.controller) {
          sword.controller = ctx.controller
          pushLog(ctx.state, ctx.controller, 'The Sellsword follows the coin.')
        }
      },
    }]
  },
})
