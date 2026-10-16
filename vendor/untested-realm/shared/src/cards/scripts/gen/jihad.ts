import { registerScript } from '../registry'
import { getCard } from '../../db'
import { summonPermissionAura } from '../multi-card-utils/summon-permission-aura'

// 'You may summon fire minions to affected sites. / Allied fire minions
//  occupying affected sites have +1 power.'
registerScript('Jihad', summonPermissionAura({
  canSummon: (_s, _p, name) => getCard(name).elements.includes('Fire'),
  bonus: { applies: (_s, u) => !u.isAvatar && getCard(u.name).elements.includes('Fire') },
}))
