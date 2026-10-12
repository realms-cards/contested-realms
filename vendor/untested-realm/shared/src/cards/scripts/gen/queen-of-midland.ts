import { registerScript } from '../registry'

// 'After an opponent draws a card, if they have more cards than you, you may draw a card.'
registerScript('Queen of Midland', {
  onCardDrawn: (ctx, player) => {
    if (player === ctx.controller) return
    const mine = ctx.state.players[ctx.controller].hand.length
    const theirs = ctx.state.players[player].hand.length
    if (theirs > mine) ctx.ask({ kind: 'yesNo', title: 'Queen of Midland: draw a card to keep pace?' }, 'keepPace')
  },
  conts: {
    // "draw a CARD" — the controller chooses which deck to draw from (a site from the atlas
    // or a spell from the spellbook), exactly like the start-of-turn draw. drawCard handles
    // the choice (and the Magician/Pathfinder "spell only" case).
    keepPace: (ctx, _c, yes) => {
      if (yes) ctx.drawCard(ctx.controller)
    },
  },
})
