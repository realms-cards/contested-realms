import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effAttack } from '../../../engine/statics'

// 'Whenever Sir Kay targets a weaker minion, he untaps.'
registerScript('Sir Kay', {
  onTargetsUnit: (ctx, target) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || target.isAvatar) return
    if (effAttack(ctx.state, target) < effAttack(ctx.state, self)) {
      self.tapped = false
      pushLog(ctx.state, ctx.controller, 'Sir Kay scoffs at the effort and readies himself again.')
    }
  },
})
