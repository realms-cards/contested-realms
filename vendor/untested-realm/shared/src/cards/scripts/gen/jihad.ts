import { registerScript } from '../registry'
import { getCard } from '../../db'
import { siteAt } from '../../../engine/grid'

// 'You may summon fire minions to affected sites. / Allied fire minions
//  occupying affected sites have +1 power.'
registerScript('Jihad', {
  auraAllowsSummon: (state, aura, player, cardName, at) =>
    aura.controller === player && getCard(cardName).elements.includes('Fire') &&
    aura.squares.some((s) => s.x === at.x && s.y === at.y),
  auraGrantsPower: (state, aura, unit) => {
    if (unit.isAvatar || unit.controller !== aura.controller || unit.region !== 'surface') return 0
    if (!getCard(unit.name).elements.includes('Fire')) return 0
    return aura.squares.some((s) => s.x === unit.x && s.y === unit.y && siteAt(state, s.x, s.y)) ? 1 : 0
  },
})
