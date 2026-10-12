import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'Genesis â†’ Conjure a broken Weapon or Armor here.'
registerScript('Battlefield', {
  genesis: (ctx) => {
    const options: string[] = []
    for (const p of ctx.state.players) {
      for (const id of p.cemetery) {
        const def = getCard(ctx.state.cards[id].name)
        if (def.type === 'Artifact' && (def.subtypes.includes('Weapon') || def.subtypes.includes('Armor'))) {
          options.push(ctx.state.cards[id].name)
        }
      }
    }
    if (!options.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Conjure which broken Weapon or Armor?', data: { options: [...new Set(options)] } }, 'raise')
  },
  conts: {
    raise: (ctx, _c, choice) => {
      const site = ctx.state.sites[ctx.sourceId]
      if (!site || !choice) return
      for (const p of ctx.state.players) {
        const idx = p.cemetery.findIndex((id) => ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [cardId] = p.cemetery.splice(idx, 1)
          const artId = `a${ctx.state.nextId++}`
          ctx.state.artifacts[artId] = {
            id: artId, cardId, name: String(choice), conjuredBy: ctx.controller,
            x: site.x, y: site.y, region: 'surface', carriedBy: null, tapped: false,
          }
          pushLog(ctx.state, ctx.controller, `${choice} is reforged on the Battlefield.`)
          return
        }
      }
    },
  },
})
