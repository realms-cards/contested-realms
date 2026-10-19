import { registerScript } from '../registry'
import { noteAddedToEnd, noteSeenAtEnd } from '../../../engine/knowledge'

// 'Genesis → Look at your bottom three spells. Put one on top of your spellbook.'
registerScript('Kelp Cavern', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const bottom = p.spellbook.slice(-3)
    if (!bottom.length) return
    const names = bottom.map((id) => ctx.state.cards[id].name)
    noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'bottom', bottom)
    ctx.ask({ kind: 'chooseOption', title: `Bottom spells: ${names.join(', ')}. Put which on top?`, data: { options: [...new Set(names)] } }, 'surface', { seen: bottom })
  },
  conts: {
    surface: (ctx, c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const seen = (c.seen as string[] | undefined) ?? p.spellbook.slice(-3)
      // search from the bottom up
      for (let i = p.spellbook.length - 1; i >= Math.max(0, p.spellbook.length - 3); i--) {
        if (ctx.state.cards[p.spellbook[i]].name === choice) {
          const [id] = p.spellbook.splice(i, 1)
          noteAddedToEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'top', [id], () => p.spellbook.unshift(id))
          noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'bottom', seen.filter((s) => s !== id))
          return
        }
      }
      noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'bottom', seen)
    },
  },
})
