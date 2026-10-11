import { registerScript } from '../registry'
import { opponent } from '../../../engine/effects'

// 'Deathrite → Each opponent discards a random card.'
registerScript('Pookas', {
  deathrite: (ctx) => ctx.discardRandom(opponent(ctx.controller)),
})
