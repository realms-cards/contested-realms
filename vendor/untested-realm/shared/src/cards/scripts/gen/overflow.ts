import { registerScript } from '../registry'
import { getCard } from '../../db'
import { legalSiteSquares, playSite } from '../../../engine/casting'

// 'Draw a site. You may play a water site.'
registerScript('Overflow', {
  onCast: (ctx) => {
    ctx.draw(ctx.controller, 'atlas')
    const p = ctx.state.players[ctx.controller]
    const waters = [...new Set(p.hand.map((id) => ctx.state.cards[id].name).filter((n) => {
      const def = getCard(n)
      return def.type === 'Site' && def.thresholds.water > 0
    }))]
    if (!waters.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Play which water site (free)?', data: { options: [...waters, '(none)'] } }, 'surge')
  },
  conts: {
    surge: (ctx, _c, choice) => {
      if (!choice || choice === '(none)') return
      // a played site must follow normal placement rules (void/rubble, adjacent to a
      // site you control, or as close as possible to your Avatar)
      const squares = legalSiteSquares(ctx.state, ctx.controller, choice as string)
      if (!squares.length) return ctx.log(`Nowhere legal to play ${choice}.`)
      ctx.ask({ kind: 'chooseSquare', title: `Place ${choice} where?`, data: { squares } }, 'flow', { name: choice })
    },
    flow: (ctx, contCtx, choice) => {
      const { x, y } = choice ?? {}
      if (x === undefined) return
      const cardId = ctx.state.players[ctx.controller].hand.find((id) => ctx.state.cards[id].name === contCtx.name)
      if (!cardId) return
      const err = playSite(ctx.state, ctx.controller, cardId, x, y) // validates placement + genesis/mana/ward
      if (err) ctx.log(err)
    },
  },
})
