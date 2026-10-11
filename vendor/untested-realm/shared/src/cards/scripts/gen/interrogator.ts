import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'

// Interrogator avatar: 'Whenever an ally strikes an enemy Avatar, draw a spell
// unless they pay 3 life.'
registerScript('Interrogator', {
  onAllyStrikesAvatar: (ctx, striker, avatar) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || striker.controller !== ctx.controller || avatar.controller === ctx.controller) return
    ctx.ask(
      { kind: 'chooseOption', title: `Interrogation: ${ctx.state.players[avatar.controller].name} pays 3 life, or you draw a spell?`, data: { options: ['pay 3 life', 'let them draw'] }, player: avatar.controller },
      'answer',
      { victim: avatar.controller },
    )
  },
  conts: {
    answer: (ctx, contCtx, choice) => {
      if (choice === 'pay 3 life') {
        ctx.loseLife(contCtx.victim as PlayerId, 3)
      } else {
        ctx.draw(ctx.controller, 'spellbook')
      }
    },
  },
})
