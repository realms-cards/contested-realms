import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Untaps after striking Undead.'
registerScript('Rowdy Boys', {
  onStrike: (ctx, target) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || target.isAvatar) return
    if (effSubtypes(ctx.state, target).includes('Undead')) {
      self.tapped = false
      pushLog(ctx.state, ctx.controller, 'The Rowdy Boys whoop and wind up for another round!')
    }
  },
})
