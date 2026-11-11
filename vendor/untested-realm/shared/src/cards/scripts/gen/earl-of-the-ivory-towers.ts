import { registerScript } from '../registry'
import { getCard } from '../../db'

// "Non-Ordinary Spellcaster / Can't be targeted or damaged by the Ordinary."
registerScript('Earl of the Ivory Towers', {
  // Ordinary spells and abilities can't target him, and an Ordinary unit can't attack him at all (the
  // defender of an attack is targeted)
  cantBeTargetedBy: (_state, _selfId, sourceName) => getCard(sourceName).rarity === 'Ordinary',
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId) return amount
    const rarity = source.name ? getCard(source.name).rarity : null
    return rarity === 'Ordinary' ? 0 : amount
  },
})
