import { registerScript } from '../registry'

// 'Genesis → Provides (E)(F)(W) this turn.'
registerScript('Twilight Bloom', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.tempThresh = ctx.state.flow.tempThresh ?? {}
    const cur = ctx.state.flow.tempThresh[ctx.controller] ?? { air: 0, earth: 0, fire: 0, water: 0 }
    ctx.state.flow.tempThresh[ctx.controller] = { ...cur, earth: (cur.earth ?? 0) + 1, fire: (cur.fire ?? 0) + 1, water: (cur.water ?? 0) + 1 }
  },
})
