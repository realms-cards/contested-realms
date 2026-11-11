import { registerScript } from '../registry'
import { topBottomWrapStepsFor } from '../multi-card-utils/wrap-step'

// 'Allied units here can move as if the top and bottom edges of the realm were
//  connected.' extraSteps only ever fires for the MOVER itself, so the wrap must be
//  GRANTED to allies sharing the site via grantsExtraSteps; the Explorers itself is
//  covered by its own extraSteps.
registerScript('Polar Explorers', {
  extraSteps: (state, unit, from) => topBottomWrapStepsFor(state, unit, from), // the Explorers itself
  grantsExtraSteps: (state, selfId, unit, from) => {
    const self = state.units[selfId]
    // only allied units standing at the Explorers' location ("here") get the wrap
    if (!self || unit.controller !== self.controller || from.x !== self.x || from.y !== self.y) return []
    return topBottomWrapStepsFor(state, unit, from)
  },
})
