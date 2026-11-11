import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'

// "Sir Galahad's strike damage against units heals you. / Nearby allies take no
//  damage from Demons, Spirits, and Undead."
registerScript('Sir Galahad', {
  damagePreventer: true,
  damagePreviewPure: true,
  strikeLifelink: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    const self = state.units[selfId]
    // "Nearby allies" is self-inclusive, so Galahad also takes no damage from Demons/Spirits/Undead himself.
    if (!self || self.silenced || victim.controller !== self.controller) return amount
    if (!nearbySquaresW(state, self.x, self.y).some((s) => s.x === victim.x && s.y === victim.y)) return amount
    // a striker, or a unit dealing damage with its ability (Draconian Bonekite): "from" covers both
    const dealer = source?.attackerId ?? source?.sourceUnitId
    const striker = dealer ? state.units[dealer] : null
    if (!striker) return amount
    const st = effSubtypes(state, striker)
    return st.includes('Demon') || st.includes('Spirit') || st.includes('Undead') ? 0 : amount
  },
})
