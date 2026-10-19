import { registerScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'
import { knownCards, noteAddedToEnd, noteKnownCards, noteSeenAtEnd } from '../../../engine/knowledge'

// 'Genesis → Look at your topmost spell. You may put it on the bottom of your
//  spellbook, then an opponent may exchange your top and bottommost spells. Draw a card.'
registerScript('Riddle Sphinx', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    if (!p.spellbook.length) return ctx.drawCard(ctx.controller)
    noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'top', [p.spellbook[0]])
    ctx.ask(
      { kind: 'chooseOption', title: 'Your topmost spell — put it on the bottom?', data: { options: ['keep on top', 'put on bottom'], reveal: ctx.state.cards[p.spellbook[0]].name } },
      'riddle',
    )
  },
  conts: {
    riddle: (ctx, _c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const seen = p.spellbook[0]
      if (choice === 'put on bottom' && seen !== undefined) {
        noteAddedToEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'bottom', [seen], () => p.spellbook.push(p.spellbook.shift()!))
      } else if (seen !== undefined) noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'top', [seen])
      ctx.ask(
        { kind: 'yesNo', title: `Exchange ${ctx.state.players[ctx.controller].name}'s top and bottommost spells?`, player: opponent(ctx.controller) },
        'meddle',
      )
    },
    meddle: (ctx, _c, yes) => {
      const p = ctx.state.players[ctx.controller]
      if (yes && p.spellbook.length > 1) {
        const top = p.spellbook[0]
        const bottom = p.spellbook[p.spellbook.length - 1]
        // the exchange itself is public: whoever knew either end now knows the card that took its place
        const knew = ([0, 1] as const).map((v) => ({
          v,
          top: knownCards(ctx.state, v, ctx.controller, 'spellbook', 'top'),
          bottom: knownCards(ctx.state, v, ctx.controller, 'spellbook', 'bottom'),
        }))
        p.spellbook[0] = bottom
        p.spellbook[p.spellbook.length - 1] = top
        pushLog(ctx.state, ctx.controller, 'The Sphinx’s riddle is meddled with.')
        for (const k of knew) {
          noteKnownCards(ctx.state, k.v, ctx.controller, 'spellbook', 'top', k.bottom.length ? [bottom, ...k.top.slice(1)] : [])
          noteKnownCards(ctx.state, k.v, ctx.controller, 'spellbook', 'bottom', k.top.length ? [...k.bottom.slice(0, -1), top] : [])
        }
      }
      ctx.drawCard(ctx.controller)
    },
  },
})
