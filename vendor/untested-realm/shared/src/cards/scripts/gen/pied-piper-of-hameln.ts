import { registerScript } from '../registry'
import { effAttack, effDefence } from '../../../engine/statics'
import { controlLordScript } from './control-lord'

// 'You control all minions with 1 or less power.' — a continuous control lord (see control-lord.ts):
// claims on entry + each turn + on entrants, and reverts its court when it leaves the realm or is
// silenced/disabled.
registerScript('Pied Piper of Hameln', {
  ...controlLordScript((state, u) => Math.floor((effAttack(state, u) + effDefence(state, u)) / 2) <= 1),
})
