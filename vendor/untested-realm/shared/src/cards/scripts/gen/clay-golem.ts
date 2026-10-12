import { registerScript, type EffectAPI } from '../registry'
import { getKeywords } from '../../db'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Deathrite → Play your top site to an adjacent void or Rubble.' (artifact)
registerScript('Clay Golem', {
  deathrite: (ctx) => {
    const art = ctx.state.units[ctx.sourceId]
    if (!art) return
    const p = ctx.state.players[ctx.controller]
    if (p.atlas[0] === undefined) return
    const spots = adjacentSquaresW(ctx.state, art.x, art.y).filter((s) => {
      const existing = siteAt(ctx.state, s.x, s.y)
      return !existing || existing.isRubble
    })
    if (!spots.length) return
    if (spots.length === 1) return clayGolemPlace(ctx, spots[0])
    ctx.ask({ kind: 'chooseSquare', title: 'Play your top site where?', data: { squares: spots } }, 'crumble')
  },
  conts: {
    crumble: (ctx, _c, choice) => {
      const { x, y } = choice ?? {}
      if (x === undefined) return
      clayGolemPlace(ctx, { x, y })
    },
  },
})

// Clay Golem: place the top atlas site at `spot` (deletes Rubble), inherit ward, +1 mana.
function clayGolemPlace(ctx: EffectAPI, spot: { x: number; y: number }) {
  const p = ctx.state.players[ctx.controller]
  const topId = p.atlas[0]
  if (topId === undefined) return
  const existing = siteAt(ctx.state, spot.x, spot.y)
  if (existing?.isRubble) delete ctx.state.sites[existing.id]
  p.atlas.shift()
  const siteId = `s${ctx.state.nextId++}`
  ctx.state.sites[siteId] = {
    id: siteId, cardId: topId, name: ctx.state.cards[topId].name, owner: ctx.controller,
    controller: ctx.controller, x: spot.x, y: spot.y, tapped: false, isRubble: false,
    ward: getKeywords(ctx.state.cards[topId].name).ward || undefined,
  }
  p.mana += 1
  pushLog(ctx.state, ctx.controller, `The Clay Golem crumbles into ${ctx.state.cards[topId].name}.`)
}
