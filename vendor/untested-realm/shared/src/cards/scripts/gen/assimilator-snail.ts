import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Once on your turn, you may banish a dead minion. Assimilator Snail becomes a
// copy of that minion until your next turn.'
registerScript('Assimilator Snail', {
  abilities: [{
    key: 'assimilate',
    label: 'Banish a dead minion → copy it until next turn',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const options: string[] = []
      for (const p of ctx.state.players) {
        for (const id of p.cemetery) {
          if (getCard(ctx.state.cards[id].name).type === 'Minion') options.push(ctx.state.cards[id].name)
        }
      }
      if (!options.length) return ctx.log('No dead minion to assimilate.')
      ctx.ask({ kind: 'chooseOption', title: 'Assimilate which corpse?', data: { options: [...new Set(options)] } }, 'slurp')
    },
  }],
  conts: {
    slurp: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !choice) return
      for (const pid of [0, 1] as PlayerId[]) {
        const p = ctx.state.players[pid]
        const idx = p.cemetery.findIndex((id) => ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [id] = p.cemetery.splice(idx, 1)
          p.banished.push(id)
          ctx.state.flow = ctx.state.flow ?? {}
          ctx.state.flow.snailReverts = [...(ctx.state.flow.snailReverts ?? []), { unitId: self.id, back: 'Assimilator Snail', turn: ctx.state.turn, player: ctx.controller }]
          self.name = String(choice)
          pushLog(ctx.state, ctx.controller, `The Snail reshapes itself into ${choice}!`)
          return
        }
      }
    },
  },
})
