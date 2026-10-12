import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Mortals in the realm become Beasts and are silenced.'
registerScript('Bower of Bliss', {
  subtypeOverride: (_state, _selfId, _unit, st) =>
    st.includes('Mortal') ? [...st.filter((s) => s !== 'Mortal'), 'Beast'] : st,
  silencesUnit: (_state, _selfId, unit) => !unit.isAvatar && getCard(unit.name).subtypes.includes('Mortal'),
})
