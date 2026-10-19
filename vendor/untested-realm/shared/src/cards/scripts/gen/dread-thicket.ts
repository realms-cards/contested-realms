import { registerScript } from '../registry'

// 'The first attack out of this site each turn can't be defended.'
// FAQ: "out of" = take exactly one step away from the Thicket, then attack — combat only asks this hook
// when the attacker's last step left this site. Attacking ON the Thicket is a normal attack.
registerScript('Dread Thicket', {
  siteMakesAttackUndefended: (state, site, attacker) => {
    if (attacker.x === site.x && attacker.y === site.y) return false // never left it
    state.flow = state.flow ?? {}
    const key = `dreadThicket:${site.id}`
    if (state.flow[key] === state.turn) return false
    state.flow[key] = state.turn
    return true
  },
})
