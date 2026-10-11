import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Bearer has +1 power for each of their elements. If they have all four, they
// are also immune to damage.' (immunity handled via damageReduction below)
registerScript('Excalibur', {
  bearerPowerFn: (state, artifactId, bearer) => getCard(bearer.name).elements.length,
  damageReduction: (state, self, victim) => {
    // `self` here is any unit carrying Excalibur with all four elements
    if (victim.id !== self.id) return 0
    const hasIt = self.carrying.some((id) => state.artifacts[id]?.name === 'Excalibur')
    return hasIt && getCard(self.name).elements.length >= 4 ? 999 : 0
  },
})
