import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { effAttack } from '../../../engine/statics'
import { pushLog, killUnit } from '../../../engine/effects'

// 'Once on your turn, fill the goblet by sacrificing a minion here, or empty it...'
registerScript('Hemogoblet', {
  abilities: [{
    key: 'goblet',
    label: 'Fill or empty the Hemogoblet',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      art.counters = art.counters ?? {}
      if (art.counters.usedTurn === ctx.state.turn) return ctx.log('Already used this turn.')
      if (art.counters.blood) {
        ctx.ask({ kind: 'chooseOption', title: `Empty the goblet (${art.counters.blood})?`, data: { options: ['gain mana', 'heal life', 'leave it'] } }, 'empty')
      } else {
        const meals = unitsAt(ctx.state, art.x, art.y, art.region).filter((u) => !u.isAvatar && u.controller === ctx.controller).map((u) => u.id)
        if (!meals.length) return ctx.log('No minion here to sacrifice.')
        ctx.ask({ kind: 'chooseTargets', title: 'Fill the goblet with whom?', data: { candidates: meals, count: 1, upTo: true, kind: 'unit' } }, 'fill')
      }
    },
  }],
  conts: {
    fill: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const art = ctx.state.artifacts[ctx.sourceId]
      const u = id ? ctx.state.units[id] : null
      if (!art || !u) return
      art.counters = { ...art.counters, blood: effAttack(ctx.state, u), usedTurn: ctx.state.turn }
      killUnit(ctx.state, u.id)
      pushLog(ctx.state, ctx.controller, 'The goblet brims red.')
    },
    empty: (ctx, _c, choice) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art || choice === 'leave it') return
      const n = art.counters?.blood ?? 0
      art.counters = { ...art.counters, blood: 0, usedTurn: ctx.state.turn }
      if (choice === 'gain mana') ctx.state.players[ctx.controller].mana += n
      else ctx.gainLife(ctx.controller, n)
    },
  },
})
