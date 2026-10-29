import { registerScript } from '../registry'
import { GRID_H, GRID_W, edgesConnected, inBounds, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import { regionPresentAt } from '../../../engine/statics'

// 'Units here have "Tap → Give Rolling Boulder a push. It rolls as far as
//  possible and deals 4 damage to each other unit along its path."'
registerScript('Rolling Boulder', {
  artifactGrantsAbilities: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    // "Units here" = wherever the Boulder sits — including when it's being carried,
    // in which case its location is the carrier's, so units there (the carrier and
    // any others) can still push it.
    if (!art || unit.x !== art.x || unit.y !== art.y || unit.region !== art.region) return []
    return [{
      key: 'boulder:push',
      label: 'Push the Rolling Boulder',
      cost: { tap: true },
      effect: (ctx) => {
        ctx.ask({ kind: 'chooseOption', title: 'Push the Boulder which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'roll', { artId: artifactId })
      },
      // the granted ability's asks resolve on this (the granting) script's conts (AbilityDef.contOwner)
    }]
  },
  conts: {
    roll: (ctx, c, dir) => {
      const pusher = ctx.state.units[ctx.sourceId]
      if (!pusher || typeof dir !== 'string') return
      // the Boulder that granted the push — carried or not (a carried Boulder sits at its carrier's location)
      const shares = (a: { x: number; y: number; region: string }) => a.x === pusher.x && a.y === pusher.y && a.region === pusher.region
      const byId = typeof c?.artId === 'string' ? ctx.state.artifacts[c.artId] : undefined
      const art = byId ?? Object.values(ctx.state.artifacts).find((a) => a.name === 'Rolling Boulder' && shares(a))
      if (!art || !shares(art)) return
      const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
      const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
      if (!dx && !dy) return
      const start = { x: art.x, y: art.y }
      // its path: its own location, then each next location in that direction in its own region (FAQ: "It
      // travels in a chosen cardinal direction, staying within the same region"). Under Magellan Globe it
      // "continues until it would repeat a step (i.e. back to where it started), and then stops".
      const wrap = edgesConnected(ctx.state)
      const path = [start]
      for (;;) {
        const last = path[path.length - 1]
        let nx = last.x + dx
        let ny = last.y + dy
        if (!inBounds(nx, ny)) {
          if (!wrap) break
          nx = (nx + GRID_W) % GRID_W
          ny = (ny + GRID_H) % GRID_H
        }
        if ((nx === start.x && ny === start.y) || !regionPresentAt(ctx.state, art.region, nx, ny)) break
        path.push({ x: nx, y: ny })
      }
      // 4 damage to EACH other unit along its path — once, even an oversized one spanning several squares;
      // units sharing the site it rested on are crushed too (only the pusher is spared)
      const hit = new Set<string>([ctx.sourceId])
      for (const sq of path) {
        for (const u of unitsAt(ctx.state, sq.x, sq.y, art.region)) {
          if (hit.has(u.id)) continue
          hit.add(u.id)
          ctx.dealDamage({ unit: u.id }, 4)
        }
      }
      const end = path[path.length - 1]
      // if the Boulder actually rolled away from a carrier, it's dropped (it no longer
      // shares the carrier's location)
      if (art.carriedBy && path.length > 1) {
        const carrier = ctx.state.units[art.carriedBy]
        if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
        art.carriedBy = null
      }
      art.x = end.x
      art.y = end.y
      // remember who pushed it this turn — the Lord of Greed "yo-yo" achievement reads this on snatch-back
      art.counters = { ...art.counters, pushedTurn: ctx.state.turn, pushedBy: ctx.controller }
      pushLog(ctx.state, ctx.controller, `The Boulder thunders to a stop at (${end.x + 1},${end.y + 1}).`)
    },
  },
})
