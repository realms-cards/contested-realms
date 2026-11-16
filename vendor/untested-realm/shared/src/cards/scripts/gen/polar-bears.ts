import { registerScript } from '../registry'
import { topBottomWrapStepsFor } from '../multi-card-utils/wrap-step'

// 'Can move as if the top and bottom edges of the realm were connected.'
registerScript('Polar Bears', {
  extraSteps: (state, unit, from) => topBottomWrapStepsFor(state, unit, from),
})
