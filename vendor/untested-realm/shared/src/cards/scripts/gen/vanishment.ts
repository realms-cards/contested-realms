import { registerScript } from '../registry'

// 'Give all allied minions Stealth. Draw a spell.'
registerScript('Vanishment', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller === ctx.controller && !u.isAvatar) u.stealth = true
    }
    ctx.draw(ctx.controller, 'spellbook')
  },
})
