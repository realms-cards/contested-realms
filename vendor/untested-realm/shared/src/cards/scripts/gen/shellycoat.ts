import { registerScript } from '../registry'

// 'Submerge / Takes 1 less damage.'
registerScript('Shellycoat', {
  damageReduction: (state, self, victim) => (victim.id === self.id ? 1 : 0),
})
