import { registerScript } from '../registry'

// 'The first attack out of this site each turn can't be defended.'
registerScript('Dread Thicket', {
  siteMakesAttackUndefended: (state, site, attacker) => {
    if (attacker.x !== site.x || attacker.y !== site.y || attacker.region !== 'surface') return false
    state.flow = state.flow ?? {}
    const key = `dreadThicket:${site.id}`
    if (state.flow[key] === state.turn) return false
    state.flow[key] = state.turn
    return true
  },
})
