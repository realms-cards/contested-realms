import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'

// 'Kill all Mortals.'
registerScript('All Mortals Gone', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && hasSubtype(ctx.state, u, 'Mortal')) ctx.kill(u.id)
    }
  },
})
