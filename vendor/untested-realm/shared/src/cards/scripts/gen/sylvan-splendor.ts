import { registerScript } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Whenever you cast a Beast or Faerie to an affected site, draw a spell.
//  Dispel if an affected site is successfully attacked.'
registerScript('Sylvan Splendor', {
  onUnitEnters: (ctx, entered) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura || entered.isAvatar || entered.controller !== ctx.controller || entered.enteredTurn !== ctx.state.turn) return
    if (!aura.squares.some((s) => s.x === entered.x && s.y === entered.y)) return
    const st = effSubtypes(ctx.state, entered)
    if (st.includes('Beast') || st.includes('Faerie')) ctx.draw(ctx.controller, 'spellbook')
  },
  onSiteDamaged: (ctx, site) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura || !aura.squares.some((s) => s.x === site.x && s.y === site.y)) return
    const card = ctx.state.cards[aura.cardId]
    if (card) toCemetery(ctx.state, card.id)
    delete ctx.state.auras[ctx.sourceId]
    pushLog(ctx.state, ctx.controller, 'The Sylvan Splendor fades with the broken glade.')
  },
})
