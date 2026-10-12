import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// "Return from Death's Door to 1 life."
// FAQ: castable at any life total — it removes Death's Door and SETS life to 1.
registerScript('Divine Intervention', {
  onCast: (ctx) => {
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
    if (!avatar) return
    avatar.deathsDoor = false
    avatar.doorTurn = undefined
    avatar.life = 1
    pushLog(ctx.state, ctx.controller, '✨ Divine Intervention! Life set to 1.')
  },
})
