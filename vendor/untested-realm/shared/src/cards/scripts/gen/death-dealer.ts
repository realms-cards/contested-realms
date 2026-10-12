import { registerScript } from '../registry'

// 'Genesis → Kill all other minions.'
registerScript('Death Dealer', {
  genesis: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && u.id !== ctx.sourceId) ctx.kill(u.id)
    }
  },
})
