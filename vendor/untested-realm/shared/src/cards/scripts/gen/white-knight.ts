import { registerScript } from '../registry'

// 'Costs (2) less to cast if you have less life than each opponent.'
registerScript('White Knight', {
  selfCostModifier: (state, player) => {
    const mine = Object.values(state.units).find((u) => u.isAvatar && u.controller === player)?.life ?? 0
    const theirs = Object.values(state.units).find((u) => u.isAvatar && u.controller !== player)?.life ?? 0
    return mine < theirs ? -2 : 0
  },
})
