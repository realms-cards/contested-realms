import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { affinity } from '../../../engine/casting'

// '(W)(W)(W) — Genesis → Summon three submerged Frog tokens here.'
registerScript('Tadpole Pool', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    // (W)(W)(W) is a true-affinity gate (pool's own Water + bonuses), not just printed Water on your sites.
    if (affinity(ctx.state, ctx.controller).water < 3) return
    for (let i = 0; i < 3; i++) ctx.summonToken('Frog', ctx.controller, self.x, self.y, 'underwater')
    pushLog(ctx.state, ctx.controller, 'The pool teems with pond life.')
  },
})
