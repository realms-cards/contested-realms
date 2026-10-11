import { registerScript } from '../registry'

// 'Sacrifice the caster or lose half your life, rounding up. If you do, draw three cards.'
registerScript('Pact with the Devil', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    const options = caster.isAvatar
      ? ['Lose half your life']
      : ['Sacrifice the caster', 'Lose half your life']
    ctx.ask({ kind: 'chooseOption', title: 'Pact with the Devil', data: { options } }, 'pact', { pactCasterId: caster.id })
  },
  conts: {
    pact: (ctx, contCtx, choice) => {
      if (choice === 'Sacrifice the caster') {
        const u = ctx.state.units[contCtx.pactCasterId]
        if (!u || u.isAvatar) return
        ctx.kill(u.id)
      } else {
        const avatar = ctx.state.units[ctx.state.players[ctx.controller].avatarUnitId]
        ctx.loseLife(ctx.controller, Math.ceil((avatar.life ?? 0) / 2))
      }
      ctx.drawCard(ctx.controller, 3)
    },
  },
})
