import { registerScript } from '../registry'
import { effAttack } from '../../../engine/statics'

// ---------- damage statics ----------

// 'Takes no damage from units with 4 or more power.'
registerScript('Sling Pixies', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    // a striker, or a unit dealing damage with its ability (Infernal Legion)
    const dealer = source?.attackerId ?? source?.sourceUnitId
    if (victim.id !== selfId || !dealer) return amount
    const striker = state.units[dealer]
    return striker && effAttack(state, striker) >= 4 ? 0 : amount
  },
})
