import { registerScript } from '../registry'

// 'Genesis → Lose 2 life.'
registerScript('Lesser Blood Demon', {
  genesis: (ctx) => ctx.loseLife(ctx.controller, 2),
})
