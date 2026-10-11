import { registerScript } from '../registry'

// 'Genesis → Draw a spell for each minion in the void.'
registerScript('Stargazer', {
  genesis: (ctx) => {
    const n = Object.values(ctx.state.units).filter((u) => !u.isAvatar && u.region === 'void').length
    if (n) ctx.draw(ctx.controller, 'spellbook', n)
  },
})
