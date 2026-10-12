import { registerScript } from '../registry'

// 'Genesis → You lose 4 life.'
registerScript('Greater Blood Demon', {
  genesis: (ctx) => ctx.loseLife(ctx.controller, 4),
})
