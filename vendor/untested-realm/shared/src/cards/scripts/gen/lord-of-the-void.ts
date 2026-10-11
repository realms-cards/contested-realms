import { registerScript } from '../registry'
import { pushLog, killUnit, checkStateBased } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, Lord of the Void may banish an adjacent site,
//  unless there's an Avatar there.'
registerScript('Lord of the Void', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const squares = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => {
      const site = siteAt(ctx.state, s.x, s.y)
      return site && !unitsAt(ctx.state, s.x, s.y).some((u) => u.isAvatar)
    })
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The Lord of the Void unmakes which adjacent site? (skip via Esc)', data: { squares } }, 'unmake')
  },
  conts: {
    unmake: (ctx, _c, sq) => {
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      if (!site || unitsAt(ctx.state, site.x, site.y).some((u) => u.isAvatar)) return
      const card = ctx.state.cards[site.cardId]
      if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
      delete ctx.state.sites[site.id]
      for (const u of unitsAt(ctx.state, sq!.x, sq!.y)) {
        if (!u.isAvatar) killUnit(ctx.state, u.id)
      }
      checkStateBased(ctx.state)
      pushLog(ctx.state, ctx.controller, `${site.name} is unmade — only void remains.`)
    },
  },
})
