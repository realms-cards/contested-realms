import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Summon two Foot Soldier tokens here. / Enemy projectiles can't enter here.'
registerScript('Sir Morien', {
  unitBlocksProjectiles: true,
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    ctx.summonToken('Foot Soldier', ctx.controller, self.x, self.y)
    ctx.summonToken('Foot Soldier', ctx.controller, self.x, self.y)
    pushLog(ctx.state, ctx.controller, "Sir Morien's men form up around him.")
  },
})
