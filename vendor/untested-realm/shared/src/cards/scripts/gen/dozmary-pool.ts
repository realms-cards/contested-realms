import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { affinity } from '../../../engine/casting'

// '(W)(W)(W) – Genesis → You may submerge an artifact from your hand here.'
// The "(W)(W)(W)" prefix is an AFFINITY requirement (3 Water, counting the pool's own Water plus
// any bonuses). It was ungated — the sink was offered regardless of your Water threshold.
registerScript('Dozmary Pool', {
  genesis: (ctx) => {
    if (affinity(ctx.state, ctx.controller).water < 3) return
    const p = ctx.state.players[ctx.controller]
    const arts = [...new Set(p.hand.map((id) => ctx.state.cards[id].name).filter((n) => getCard(n).type === 'Artifact'))]
    if (!arts.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Sink which artifact into the pool?', data: { options: [...arts, '(none)'] } }, 'sink')
  },
  conts: {
    sink: (ctx, _c, choice) => {
      if (!choice || choice === '(none)') return
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const p = ctx.state.players[ctx.controller]
      const idx = p.hand.findIndex((id) => ctx.state.cards[id].name === choice)
      if (idx < 0) return
      const [cardId] = p.hand.splice(idx, 1)
      const artId = `a${ctx.state.nextId++}`
      ctx.state.artifacts[artId] = {
        id: artId, cardId, name: String(choice), conjuredBy: ctx.controller,
        x: self.x, y: self.y, region: 'underwater', carriedBy: null, tapped: false,
      }
      pushLog(ctx.state, ctx.controller, `${choice} sinks into Dozmary Pool.`)
    },
  },
})
