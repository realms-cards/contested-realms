import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'

// 'May be carried by any Beast. / Deathrite → Return to hand.'
registerScript('Sir Tom Thumb', {
  carriedByAnyone: (state, carrier) => effSubtypes(state, carrier).includes('Beast'),
  deathrite: (ctx) => ctx.bounce(ctx.sourceId),
})
