import { registerScript } from '../registry'
import { pushLog, banishSite } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, Lord of the Void may banish an adjacent site,
//  unless there's an Avatar there.'
registerScript('Lord of the Void', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // "Adjacent" = the card's OWN square plus the squares it shares a border with (rulebook). So the Lord
    // may banish the very site he stands on — doing so drops HIM into the void, where his Voidwalk lets him
    // survive (banishSite → sinkSquareIntoVoid). The "no Avatar there" guard still blocks an Avatar's square.
    const seen = new Set<string>()
    const squares = [{ x: self.x, y: self.y }, ...orthAdjacentWrapped(ctx.state, self.x, self.y)].filter((s) => {
      const key = `${s.x},${s.y}`
      if (seen.has(key)) return false
      seen.add(key)
      const site = siteAt(ctx.state, s.x, s.y)
      return !!site && !unitsAt(ctx.state, s.x, s.y).some((u) => u.isAvatar)
    })
    if (!squares.length) return
    // "MAY banish" — optional: the player can decline (Esc, or the Skip button).
    ctx.ask({ kind: 'chooseSquare', title: 'The Lord of the Void unmakes which adjacent site?', data: { squares, optional: true } }, 'unmake')
  },
  conts: {
    unmake: (ctx, _c, sq) => {
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      if (!site || unitsAt(ctx.state, site.x, site.y).some((u) => u.isAvatar)) return
      pushLog(ctx.state, ctx.controller, `${site.name} is unmade — only void remains.`)
      // banishSite leaves the square an empty void and sinks everything on it (units, cargo, ground
      // artifacts) into the void — non-voidwalkers are banished, voidwalkers remain. See effects.ts.
      banishSite(ctx.state, site.id)
    },
  },
})
