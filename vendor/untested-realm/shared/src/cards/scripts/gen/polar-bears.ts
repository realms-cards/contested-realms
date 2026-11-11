import { registerScript } from '../registry'
import { topBottomWrapStepsFor } from '../multi-card-utils/wrap-step'

// 'Can move as if the top and bottom edges of the realm were connected.' — the same text on the
// Frost Mage vs Lavamancer version (Polar Bears 2, a 3-cost 3/3).
for (const name of ['Polar Bears', 'Polar Bears 2']) {
  registerScript(name, {
    extraSteps: (state, unit, from) => topBottomWrapStepsFor(state, unit, from),
  })
}
