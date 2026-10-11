import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { opponent } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'
import { playSite } from '../../../engine/casting'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → Target opponent, then you, may play a site adjacent to this one.'
registerScript('Imperial Road', {
  genesis: (ctx) => roadOffer(ctx, opponent(ctx.controller), true),
  conts: {
    pick: (ctx, c, choice) => {
      const who = c.who as PlayerId
      const idx = Array.isArray(choice) ? choice[0] : choice
      const sites = c.sites as string[]
      if (typeof idx !== 'number' || !sites[idx]) return roadDone(ctx, c)
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const spots = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => !siteAt(ctx.state, s.x, s.y))
      if (!spots.length) return roadDone(ctx, c)
      ctx.ask({ kind: 'chooseSquare', title: 'Play it where?', data: { squares: spots }, player: who }, 'place', { ...c, cardId: sites[idx] })
    },
    place: (ctx, c, sq) => {
      const who = c.who as PlayerId
      const self = ctx.state.sites[ctx.sourceId]
      // the site is played BESIDE THE ROAD (not beside the player's own sites), so bypass the
      // normal placement-adjacency rule — but confirm the chosen square really is a free
      // square orthogonally adjacent to the road before forcing it in.
      if (sq && self && orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y && !siteAt(ctx.state, s.x, s.y))) {
        playSite(ctx.state, who, c.cardId as string, sq.x, sq.y, { force: true })
      }
      roadDone(ctx, c)
    },
    skip: (ctx, c, yes) => {
      if (!yes) return roadDone(ctx, c)
      const who = c.who as PlayerId
      const hand = ctx.state.players[who].hand
      const sites = hand.filter((id) => getCard(ctx.state.cards[id].name).type === 'Site')
      ctx.ask(
        { kind: 'chooseCards', title: 'Play which site by the Imperial Road?', data: { cards: sites.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true }, player: who },
        'pick',
        { ...c, sites },
      )
    },
  },
})

// offer `who` the chance to play a site beside the road; if they can't/won't, pass the option back to me
function roadOffer(ctx: EffectAPI, who: PlayerId, thenMe: boolean): void {
  const hasSites = ctx.state.players[who].hand.some((id) => getCard(ctx.state.cards[id].name).type === 'Site')
  if (!hasSites) return roadDone(ctx, { who, thenMe })
  ctx.ask({ kind: 'yesNo', title: 'Play a site adjacent to the Imperial Road?', player: who }, 'skip', { who, thenMe })
}

function roadDone(ctx: EffectAPI, c: any): void {
  if (c.thenMe) roadOffer(ctx, ctx.controller, false)
}
