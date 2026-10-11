import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'

// 'Takes no damage from Demon, Spirit, or Undead minions.'
registerScript('Sirian Templar', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId || !source?.attackerId) return amount
    const striker = state.units[source.attackerId]
    if (!striker || striker.isAvatar) return amount
    const st = effSubtypes(state, striker)
    return st.includes('Demon') || st.includes('Spirit') || st.includes('Undead') ? 0 : amount
  },
})
