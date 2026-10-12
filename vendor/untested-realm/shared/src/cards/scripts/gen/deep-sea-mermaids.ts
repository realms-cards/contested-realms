import { registerScript } from '../registry'

// 'Submerge / Genesis → Draw your bottommost spell.'
registerScript('Deep-Sea Mermaids', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const id = p.spellbook.pop()
    if (id === undefined) {
      ctx.state.winner = ctx.controller === 0 ? 1 : 0
      ctx.state.phase = 'over'
      return
    }
    p.hand.push(id)
    ctx.log('The mermaids retrieve the bottommost spell.')
  },
})
