import { registerScript } from '../registry'
import { getCard } from '../../db'
import { siteAt } from '../../../engine/grid'

// 'If Spire Lich is atop a Tower, it has +2 power, Ranged, and Spellcaster.'
// "a Tower" = a site with the Tower subtype OR "Tower" in its name OR a built Tower of Babel (the
// merged Apex+Base, marked by counters.tower).
const isTower = (site: { name: string; counters?: Record<string, number> } | null): boolean =>
  !!site && (getCard(site.name).subtypes.includes('Tower') || /tower/i.test(site.name) || !!site.counters?.tower)

registerScript('Spire Lich', {
  selfKeywords: (state, self) => {
    return isTower(siteAt(state, self.x, self.y)) && self.region === 'surface' ? ['ranged', 'spellcaster'] : []
  },
  grantsPower: (state, self, other) => {
    if (other.id !== self.id || self.region !== 'surface') return 0
    return isTower(siteAt(state, self.x, self.y)) ? 2 : 0
  },
})
