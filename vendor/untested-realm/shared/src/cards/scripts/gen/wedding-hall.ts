import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Provides no mana, but if Arthur and Guinevere start your turn here, you win.'
registerScript('Wedding Hall', {
  noMana: true,
  startOfTurn: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    // "start your turn here" — a site's "here" includes its subsurface, so a submerged/burrowed
    // Arthur or Guinevere at this site still counts toward the royal wedding.
    const here = unitsAt(ctx.state, self.x, self.y).filter((u) => u.controller === ctx.controller)
    const arthur = here.some((u) => /Arthur/i.test(u.name))
    const guinevere = here.some((u) => /Guinevere/i.test(u.name))
    if (arthur && guinevere) {
      ctx.state.winner = ctx.controller
      ctx.state.phase = 'over'
      pushLog(ctx.state, ctx.controller, '💒 The royal wedding is held — the realm united, the game is won!')
    }
  },
})
