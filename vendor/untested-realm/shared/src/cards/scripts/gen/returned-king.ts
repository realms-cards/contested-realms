import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'
import { controlLordScript } from './control-lord'

// 'Other Undead have +1 power. / You control all Undead.'
registerScript('Returned King', {
  grantsPower: (state, self, other) => {
    if (other.id === self.id || other.isAvatar) return 0
    return effSubtypes(state, other).includes('Undead') ? 1 : 0
  },
  // 'You control all Undead.' — a continuous control lord (see control-lord.ts): claims on entry +
  // each turn + on entrants, and reverts its court when it leaves the realm or is silenced/disabled.
  ...controlLordScript((state, u) => effSubtypes(state, u).includes('Undead')),
})
