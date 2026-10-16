import { registerScript } from '../registry'
import { getCard } from '../../db'
import { summonPermissionAura } from '../multi-card-utils/summon-permission-aura'

// 'You may summon earth minions to affected sites. / Allied earth minions
//  occupying affected sites have +1 power.'
registerScript('Crusade', summonPermissionAura({
  canSummon: (_s, _p, name) => getCard(name).elements.includes('Earth'),
  bonus: { applies: (_s, u) => !u.isAvatar && getCard(u.name).elements.includes('Earth') },
}))
