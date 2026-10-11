import { registerScript } from '../registry'

// 'Takes 2 less damage.' (avatar). NB: `self.name` is NOT re-checked — the engine only
// fetches this hook via getScript(unit.name), so `self` is already the Ironclad avatar in
// normal play; the Imposter also forwards here while wearing Ironclad's face (self = the
// Imposter), and re-checking the name would wrongly block that reduction.
registerScript('Ironclad', {
  damageReduction: (state, self, victim) => (victim.id === self.id && self.isAvatar ? 2 : 0),
})
