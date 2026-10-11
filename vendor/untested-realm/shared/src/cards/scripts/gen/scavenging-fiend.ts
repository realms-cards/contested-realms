import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Genesis → Conjure a broken artifact to this location.'
registerScript('Scavenging Fiend', {
  genesis: (ctx) => {
    const options: string[] = []
    for (const p of ctx.state.players) {
      for (const id of p.cemetery) {
        if (getCard(ctx.state.cards[id].name).type === 'Artifact') options.push(ctx.state.cards[id].name)
      }
    }
    if (!options.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Scavenge which broken artifact?', data: { options: [...new Set(options)] } }, 'scavenge')
  },
  conts: {
    scavenge: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !choice) return
      for (const p of ctx.state.players) {
        const idx = p.cemetery.findIndex((id) => ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [cardId] = p.cemetery.splice(idx, 1)
          const artId = `a${ctx.state.nextId++}`
          ctx.state.artifacts[artId] = {
            id: artId, cardId, name: String(choice), conjuredBy: ctx.controller,
            x: self.x, y: self.y, region: self.region, carriedBy: null, tapped: false,
          }
          return
        }
      }
    },
  },
})
