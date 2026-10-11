import { registerScript } from '../registry'
import { addTempThresh } from '../multi-card-utils/add-temp-thresh'

// 'Genesis → Provides (A)(E)(W) this turn.'
registerScript('Desert Bloom', {
  genesis: (ctx) => addTempThresh(ctx.state, ctx.controller, { air: 1, earth: 1, water: 1 }),
})
