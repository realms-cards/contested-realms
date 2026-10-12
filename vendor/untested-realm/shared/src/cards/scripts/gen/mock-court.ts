import { registerScript } from '../registry'
import { getCard } from '../../db'
import { courtActive } from './courts'

// 'Ordinary minions cost an additional (1) to summon.'
// Cast ordinaries pay via costModifier; effect-summoned ordinaries (tokens like Foot
// Soldiers / Frogs / Skeletons) pay via summonTax, once per token — so a card that
// summons several is taxed several times.
registerScript('Mock Court', {
  costModifier: (state, sourceId, _caster, cardName) => {
    if (!courtActive(state, sourceId)) return 0
    const def = getCard(cardName)
    return def.type === 'Minion' && def.rarity === 'Ordinary' ? 1 : 0
  },
  summonTax: (state, site, unit) => {
    if (unit.isAvatar || !courtActive(state, site.id)) return 0
    const def = getCard(unit.name)
    return def.type === 'Minion' && def.rarity === 'Ordinary' ? 1 : 0
  },
})
