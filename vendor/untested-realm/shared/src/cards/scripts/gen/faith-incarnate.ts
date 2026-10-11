import { registerScript } from '../registry'

// 'Has +2 power for each Ward in the realm.'
registerScript('Faith Incarnate', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    let wards = 0
    for (const u of Object.values(state.units)) if (u.ward) wards++
    for (const s of Object.values(state.sites)) if (s.ward) wards++
    return wards * 2
  },
})
