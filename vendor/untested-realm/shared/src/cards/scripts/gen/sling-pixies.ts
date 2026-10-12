import { registerScript } from '../registry'
import { effAttack } from '../../../engine/statics'

// ---------- damage statics ----------

// 'Takes no damage from units with 4 or more power.'
registerScript('Sling Pixies', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId || !source?.attackerId) return amount
    const striker = state.units[source.attackerId]
    return striker && effAttack(state, striker) >= 4 ? 0 : amount
  },
})
