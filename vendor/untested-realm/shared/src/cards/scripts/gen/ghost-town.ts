import { registerScript } from '../registry'

// 'Genesis → Gain (1) this turn.'
registerScript('Ghost Town', {
  genesis: (ctx) => {
    ctx.state.players[ctx.controller].mana += 1
  },
})
