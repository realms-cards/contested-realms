import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { effAttack, effSubtypes } from '../../../engine/statics'

// 'Whenever you summon a minion here, kill target nearby enemy Beast with 2 or less power.'
registerScript('Shrike Orchard', {
  onUnitEnters: (ctx, entered) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || entered.isAvatar || entered.controller !== ctx.controller) return
    if (entered.x !== self.x || entered.y !== self.y || entered.enteredTurn !== ctx.state.turn) return
    const prey = nearbySquaresW(ctx.state, self.x, self.y)
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y))
      .filter((u) => !u.isAvatar && u.controller !== ctx.controller && effSubtypes(ctx.state, u).includes('Beast') && effAttack(ctx.state, u) <= 2)
      .map((u) => u.id)
    if (!prey.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The shrikes impale which Beast?', data: { candidates: prey, count: 1, upTo: false, kind: 'unit' } }, 'impale')
  },
  conts: {
    impale: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) ctx.kill(id)
    },
  },
})
