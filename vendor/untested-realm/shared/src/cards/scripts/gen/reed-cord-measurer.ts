import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { drawCards, noAtlasDraw } from '../../../engine/effects'
import { playSite, legalSiteSquares } from '../../../engine/casting'

// 'Genesis → Play or draw a site.'
// The Avatar's site action as a Genesis (no tap): play a site from hand to a legal square, or draw one
// from the atlas. Only the options that can happen are offered; with just one it resolves directly.

const PLAY = 'Play a site'
const DRAW = 'Draw a site'

/** names of the site cards in hand that have somewhere legal to go */
function playableSites(ctx: EffectAPI): string[] {
  const p = ctx.state.players[ctx.controller]
  const names = [...new Set(p.hand.map((id) => ctx.state.cards[id].name).filter((n) => getCard(n).type === 'Site'))]
  return names.filter((n) => legalSiteSquares(ctx.state, ctx.controller, n).length > 0)
}

function resolveChoice(ctx: EffectAPI, choice: string): void {
  if (choice === DRAW) return void drawCards(ctx.state, ctx.controller, 'atlas')
  const names = playableSites(ctx)
  if (!names.length) return
  if (names.length === 1) return pickSite(ctx, names[0])
  ctx.ask({ kind: 'nameCard', title: 'Play which site?', data: { names } }, 'pickSite')
}

function pickSite(ctx: EffectAPI, name: string): void {
  const cardId = ctx.state.players[ctx.controller].hand.find((id) => ctx.state.cards[id].name === name)
  const squares = legalSiteSquares(ctx.state, ctx.controller, name)
  if (!cardId || !squares.length) return
  if (squares.length === 1) return void playSite(ctx.state, ctx.controller, cardId, squares[0].x, squares[0].y)
  ctx.ask({ kind: 'chooseSquare', title: `Play ${name} where?`, data: { squares } }, 'placeSite', { cardId })
}

registerScript('Reed Cord Measurer', {
  genesis: (ctx) => {
    const options: string[] = []
    if (playableSites(ctx).length) options.push(PLAY)
    if (!noAtlasDraw(ctx.state, ctx.controller) && ctx.state.players[ctx.controller].atlas.length > 0) options.push(DRAW)
    if (!options.length) return ctx.log('No site to play and no atlas to draw from.')
    if (options.length === 1) return resolveChoice(ctx, options[0])
    ctx.ask({ kind: 'chooseOption', title: 'Play or draw a site?', data: { options } }, 'choice')
  },
  conts: {
    choice: (ctx, _c, choice) => { if (choice === PLAY || choice === DRAW) resolveChoice(ctx, choice) },
    pickSite: (ctx, _c, name) => { if (typeof name === 'string') pickSite(ctx, name) },
    placeSite: (ctx, contCtx, sq) => {
      const cardId = contCtx?.cardId as string | undefined
      if (!sq || !cardId || !ctx.state.players[ctx.controller].hand.includes(cardId)) return
      if (!legalSiteSquares(ctx.state, ctx.controller, ctx.state.cards[cardId].name).some((q) => q.x === sq.x && q.y === sq.y)) return
      playSite(ctx.state, ctx.controller, cardId, sq.x, sq.y)
    },
  },
})
