import { registerScript } from '../registry'
import { effAttack, effDefence } from '../../../engine/statics'
import type { GameState, UnitState } from '../../../engine/types'

const avg = (state: GameState, u: UnitState) => Math.floor((effAttack(state, u) + effDefence(state, u)) / 2)

// "Units with 3 or more power can't enter this site." — an absolute entry ban: a 3-power unit
// can't be summoned, moved, OR forced in (Blink / Teleport / any relocation) here.
registerScript('Gnome Hollows', {
  entryFilterBlocksForcedEntry: true,
  entryFilter: (state, selfId, unit, from, to) => {
    const site = state.sites[selfId]
    if (!site) return true
    if (to.x !== site.x || to.y !== site.y) return true
    return avg(state, unit) < 3
  },
})
