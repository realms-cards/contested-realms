import { registerScript } from '../registry'
import { pushLog, untapUnit } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Untaps after striking Undead.'
registerScript('Rowdy Boys', {
  onStrike: (ctx, target) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || target.isAvatar) return
    if (effSubtypes(ctx.state, target).includes('Undead')) {
      untapUnit(ctx.state, self)
      pushLog(ctx.state, ctx.controller, 'The Rowdy Boys whoop and wind up for another round!')
    }
  },
})
