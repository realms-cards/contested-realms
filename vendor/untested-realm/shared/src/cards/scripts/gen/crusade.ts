import { registerScript } from '../registry'
import { getCard } from '../../db'
import { siteAt } from '../../../engine/grid'

// 'You may summon earth minions to affected sites. / Allied earth minions
//  occupying affected sites have +1 power.'
registerScript('Crusade', {
  auraAllowsSummon: (state, aura, player, cardName, at) =>
    aura.controller === player && getCard(cardName).elements.includes('Earth') &&
    aura.squares.some((s) => s.x === at.x && s.y === at.y),
  auraGrantsPower: (state, aura, unit) => {
    if (unit.isAvatar || unit.controller !== aura.controller || unit.region !== 'surface') return 0
    if (!getCard(unit.name).elements.includes('Earth')) return 0
    return aura.squares.some((s) => s.x === unit.x && s.y === unit.y && siteAt(state, s.x, s.y)) ? 1 : 0
  },
})
