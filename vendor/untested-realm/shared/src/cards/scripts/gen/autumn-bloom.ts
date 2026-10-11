import { registerScript } from '../registry'
import { addTempThresh } from '../multi-card-utils/add-temp-thresh'

// 'Genesis → Provides (A)(F)(W) this turn.'
registerScript('Autumn Bloom', {
  genesis: (ctx) => addTempThresh(ctx.state, ctx.controller, { air: 1, fire: 1, water: 1 }),
})
