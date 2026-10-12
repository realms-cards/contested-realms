import { registerScript } from '../registry'
import { getCard } from '../../db'

// "Non-Ordinary Spellcaster / Can't be targeted or damaged by the Ordinary."
registerScript('Earl of the Ivory Towers', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId) return amount
    const rarity = source.name ? getCard(source.name).rarity : null
    return rarity === 'Ordinary' ? 0 : amount
  },
})
