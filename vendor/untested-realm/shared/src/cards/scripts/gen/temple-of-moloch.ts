import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Once on each player's turn, they may sacrifice a minion here to gain (2).'
registerScript('Temple of Moloch', {
  siteGrantsAbilities: (state, site, unit) => {
    // "a minion here" includes the site's subsurface — a burrowed/submerged minion may be sacrificed too.
    if (unit.isAvatar || unit.x !== site.x || unit.y !== site.y) return []
    if (state.flow?.molochUsed?.[unit.controller] === state.turn) return []
    if (state.activePlayer !== unit.controller) return []
    return [{
      key: 'moloch:offer',
      label: 'Sacrifice this minion to Moloch → gain ②',
      cost: { sacrificeSelf: true },
      effect: (ctx) => {
        ctx.state.flow = ctx.state.flow ?? {}
        ctx.state.flow.molochUsed = { ...(ctx.state.flow.molochUsed ?? {}), [ctx.controller]: ctx.state.turn }
        ctx.state.players[ctx.controller].mana += 2
        pushLog(ctx.state, ctx.controller, 'Moloch is pleased. ② granted.')
      },
    }]
  },
})
