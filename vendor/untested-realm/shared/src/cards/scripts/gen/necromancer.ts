import { registerScript } from '../registry'
import { summonTaxOf } from '../../../engine/effects'

// 'Once on your turn, you may pay (1) to summon a Skeleton token here.' (avatar)
registerScript('Necromancer', {
  abilities: [{
    key: 'raise',
    label: '① → Summon a Skeleton here',
    cost: { mana: 1 },
    oncePerTurn: true,
    // a Mock Court's (1) per Ordinary minion is part of the total cost: it must be payable up front, or the
    // ability can't be used at all (never pay the (1) and get no Skeleton)
    available: (state, sourceId) => {
      const self = state.units[sourceId]
      if (!self) return false
      const probe = { ...self, id: '__skeleton', name: 'Skeleton', isAvatar: false }
      return state.players[self.controller].mana >= 1 + summonTaxOf(state, probe)
    },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (self) ctx.summonToken('Skeleton', ctx.controller, self.x, self.y, self.region)
    },
  }],
})
