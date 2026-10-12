import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isKnightSirDame } from '../multi-card-utils/knightly'

// ------------------------------------------------------- The Round Table ----
// 'Must be cast to your back row. / Whenever you summon King Arthur, or a
//  Knight, Sir, or Dame to The Round Table, draw a card.'
registerScript('The Round Table', {
  conjureFilter: (_state, player, at) =>
    at.y === (player === 0 ? 0 : 3) ? null : 'The Round Table must be cast to your back row.',
  onUnitEnters: (ctx, entered) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || art.carriedBy) return
    if (entered.x !== art.x || entered.y !== art.y || entered.region !== 'surface') return
    if (entered.controller !== art.conjuredBy) return
    // "King Arthur, or a Knight, Sir, or Dame" — the latter three are a naming convention (no Knight
    // subtype on Black Knight, Vanguard Knights, Sir Gawain, Dame Britomart…), so match the NAME.
    const worthy = entered.name === 'King Arthur' || isKnightSirDame(entered.name)
    if (!worthy) return
    pushLog(ctx.state, art.conjuredBy, `${entered.name} takes a seat at The Round Table.`)
    // "draw a card": the bearer chooses spellbook or atlas (drawCard handles the
    // Magician/Pathfinder "spell only" case too).
    ctx.drawCard(art.conjuredBy)
  },
})
