import { registerScript, type EffectAPI } from '../registry'
import { orthAdjacentWrapped, siteAt, squareLabel } from '../../../engine/grid'
import { checkStateBased } from '../../../engine/effects'
import type { GameState, SiteState } from '../../../engine/types'
import { trapScript } from '../multi-card-utils/trap'
import { swapSquares } from './site-move'

// 'Trap (2) → Swap this site with another adjacent site.'
// Not targeting: the springer picks any other site adjacent to this one (wrapping under Magellan Globe).
// The two sites trade squares carrying their normal-size contents, like every other site swap (Mover of
// Mountains, Baba Yaga's Hut); a site that can't be moved (Bedrock) stops the swap.
const others = (state: GameState, site: SiteState) =>
  orthAdjacentWrapped(state, site.x, site.y).filter((s) => !!siteAt(state, s.x, s.y))

function swap(ctx: EffectAPI, sq: { x: number; y: number }): void {
  const self = ctx.state.sites[ctx.sourceId]
  if (!self || !others(ctx.state, self).some((s) => s.x === sq.x && s.y === sq.y)) return
  const from = { x: self.x, y: self.y }
  if (swapSquares(ctx.state, from, sq, ctx.controller)) ctx.log(`The land slides — Landslide trades places with the site at ${squareLabel(sq.x, sq.y)}!`)
  checkStateBased(ctx.state)
}

registerScript('Landslide', trapScript({
  label: 'swap this site with another adjacent site',
  mana: 2,
  effect: (ctx, site) => {
    const squares = others(ctx.state, site)
    if (!squares.length) return ctx.log('No adjacent site to swap with.')
    if (squares.length === 1) return swap(ctx, squares[0])
    ctx.ask({ kind: 'chooseSquare', title: 'Landslide: swap with which adjacent site?', data: { squares } }, 'swap')
  },
  conts: {
    swap: (ctx, _c, sq) => {
      if (sq && typeof sq.x === 'number' && typeof sq.y === 'number') swap(ctx, sq)
    },
  },
}))
