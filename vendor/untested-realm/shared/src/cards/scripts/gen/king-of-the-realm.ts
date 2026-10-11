import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'
import { controlLordScript } from './control-lord'

// Sorcery's 'King of the Realm': 'Other Mortals have +1 power. / You control all Mortals.'
registerScript('King of the Realm', {
  // 'Other Mortals have +1 power.' — every OTHER Mortal in the realm (not just nearby,
  // unlike Mayor of Milborne); the King itself is excluded.
  grantsPower: (state, self, other) => {
    if (other.id === self.id || other.isAvatar) return 0
    return hasSubtype(state, other, 'Mortal') ? 1 : 0
  },
  // 'You control all Mortals.' — a continuous control lord (see control-lord.ts): claims on entry +
  // each turn + on entrants, and reverts its court when it leaves the realm or is silenced/disabled.
  ...controlLordScript((state, u) => hasSubtype(state, u, 'Mortal')),
})
