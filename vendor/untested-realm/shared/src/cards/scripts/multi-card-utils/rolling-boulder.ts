import type { EffectAPI } from '../registry'
import type { ArtifactState } from '../../../engine/types'
import { GRID_H, GRID_W, edgesConnected, inBounds, unitsAt } from '../../../engine/grid'
import { pushLog, dealDamageToUnit } from '../../../engine/effects'
import { regionPresentAt } from '../../../engine/statics'

/** A Rolling Boulder rolls from where it lies in direction `dir` "as far as possible and deals 4 damage
 *  to each other unit along its path" (pushed by a unit there; rolled from Bouldermaw). `spareId` is the
 *  unit that pushed it. Returns false for a bad direction. */
export function rollBoulder(ctx: EffectAPI, art: ArtifactState, dir: string, spareId?: string): boolean {
  const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
  const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
  if (!dx && !dy) return false
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
  // units sharing the site it rested on are crushed too (only the pusher, if any, is spared)
  const hit = new Set<string>(spareId ? [spareId] : [])
  for (const sq of path) {
    for (const u of unitsAt(ctx.state, sq.x, sq.y, art.region)) {
      if (hit.has(u.id)) continue
      hit.add(u.id)
      // the Boulder deals it, not the unit that pushed it (a Fire pusher doesn't make it fire damage)
      dealDamageToUnit(ctx.state, u, 4, ctx.controller, { source: { player: ctx.controller, kind: 'effect', name: 'Rolling Boulder' } })
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
  return true
}
