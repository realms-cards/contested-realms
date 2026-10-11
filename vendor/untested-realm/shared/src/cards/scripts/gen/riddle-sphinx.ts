import { registerScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'

// 'Genesis → Look at your topmost spell. You may put it on the bottom of your
//  spellbook, then an opponent may exchange your top and bottommost spells. Draw a card.'
registerScript('Riddle Sphinx', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    if (!p.spellbook.length) return ctx.drawCard(ctx.controller)
    ctx.ask(
      { kind: 'chooseOption', title: 'Your topmost spell — put it on the bottom?', data: { options: ['keep on top', 'put on bottom'], reveal: ctx.state.cards[p.spellbook[0]].name } },
      'riddle',
    )
  },
  conts: {
    riddle: (ctx, _c, choice) => {
      const p = ctx.state.players[ctx.controller]
      if (choice === 'put on bottom' && p.spellbook.length) p.spellbook.push(p.spellbook.shift()!)
      ctx.ask(
        { kind: 'yesNo', title: `Exchange ${ctx.state.players[ctx.controller].name}'s top and bottommost spells?`, player: opponent(ctx.controller) },
        'meddle',
      )
    },
    meddle: (ctx, _c, yes) => {
      const p = ctx.state.players[ctx.controller]
      if (yes && p.spellbook.length > 1) {
        const top = p.spellbook[0]
        p.spellbook[0] = p.spellbook[p.spellbook.length - 1]
        p.spellbook[p.spellbook.length - 1] = top
        pushLog(ctx.state, ctx.controller, 'The Sphinx’s riddle is meddled with.')
      }
      ctx.drawCard(ctx.controller)
    },
  },
})
