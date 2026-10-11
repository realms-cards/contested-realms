import { registerScript } from '../registry'

// 'Genesis → Look at your bottom three spells. Put one on top of your spellbook.'
registerScript('Kelp Cavern', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const bottom = p.spellbook.slice(-3)
    if (!bottom.length) return
    const names = bottom.map((id) => ctx.state.cards[id].name)
    ctx.ask({ kind: 'chooseOption', title: `Bottom spells: ${names.join(', ')}. Put which on top?`, data: { options: [...new Set(names)] } }, 'surface')
  },
  conts: {
    surface: (ctx, _c, choice) => {
      const p = ctx.state.players[ctx.controller]
      // search from the bottom up
      for (let i = p.spellbook.length - 1; i >= Math.max(0, p.spellbook.length - 3); i--) {
        if (ctx.state.cards[p.spellbook[i]].name === choice) {
          const [id] = p.spellbook.splice(i, 1)
          p.spellbook.unshift(id)
          return
        }
      }
    },
  },
})
