import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { noteAddedToEnd, noteSeenAtEnd } from '../../../engine/knowledge'

// 'At the start of your turn, look at your topmost site or spell. You may put it
// on the bottom of its deck.'
registerScript('Seer', {
  startOfTurn: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const options: string[] = []
    if (p.spellbook.length) options.push('peek at topmost spell')
    if (p.atlas.length) options.push('peek at topmost site')
    if (!options.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Seer: gaze at which deck?', data: { options: [...options, '(neither)'] } }, 'gaze')
  },
  conts: {
    gaze: (ctx, _c, choice) => {
      if (typeof choice !== 'string' || choice === '(neither)') return
      const deck = choice.includes('spell') ? 'spellbook' : 'atlas'
      const p = ctx.state.players[ctx.controller]
      const top = p[deck][0]
      if (top === undefined) return
      noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, deck, 'top', [top])
      ctx.ask(
        { kind: 'chooseOption', title: `Your topmost ${deck === 'spellbook' ? 'spell' : 'site'} — put it on the bottom?`, data: { options: ['keep on top', 'put on bottom'], reveal: ctx.state.cards[top].name } },
        'bottom',
        { deck },
      )
    },
    bottom: (ctx, c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const deck = c.deck as 'spellbook' | 'atlas'
      if (choice !== 'put on bottom') {
        if (p[deck][0] !== undefined) noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, deck, 'top', [p[deck][0]])
        return
      }
      const top = p[deck].shift()
      if (top !== undefined) noteAddedToEnd(ctx.state, ctx.controller, ctx.controller, deck, 'bottom', [top], () => p[deck].push(top))
      pushLog(ctx.state, ctx.controller, 'The Seer buries what they saw.')
    },
  },
})
