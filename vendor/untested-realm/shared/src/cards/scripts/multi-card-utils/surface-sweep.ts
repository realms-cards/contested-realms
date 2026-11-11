import { getScript, type EffectAPI } from '../registry'
import { GRID_H, GRID_W, edgesConnected, siteAt, unitsAt, inBounds } from '../../../engine/grid'
import { regionPresentAt, siteSilenced } from '../../../engine/statics'
import { siteEntryAllowed } from '../../../engine/movement'
import type { GameState, Step, UnitState } from '../../../engine/types'

/** The squares a surface sweep (Snowball's roll, Avalanche's snow) travels from `start` in direction
 *  `d`: along the surface until the edge or the void (a siteless square has no surface to cross).
 *  `projectile`: a piercing projectile can't ENTER a projectile-blocking site (Impenetrable Copse)
 *  from outside, so the path stops before one (the start square is exempt). Under Magellan Globe it
 *  crosses the connected edge and stops before it would repeat a square, like a projectile's ray and a
 *  Rolling Boulder (FAQ). */
export function surfaceSweepPath(state: GameState, start: { x: number; y: number }, d: { dx: number; dy: number }, projectile: boolean): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = []
  const wrap = edgesConnected(state)
  let x = start.x
  let y = start.y
  while (regionPresentAt(state, 'surface', x, y)) {
    const here = siteAt(state, x, y)
    if (projectile && path.length > 0 && here && getScript(here.name)?.blocksProjectiles && !siteSilenced(state, here)) break
    path.push({ x, y })
    x += d.dx
    y += d.dy
    if (!inBounds(x, y)) {
      if (!wrap) break
      x = (x + GRID_W) % GRID_W
      y = (y + GRID_H) % GRID_H
    }
    if (x === start.x && y === start.y) break
  }
  return path
}

/** Pick up every surface unit along `path` (except `excludeId`) and carry it toward the last square.
 *  A unit that CAN'T ENTER a site on the way (an enemy blocked by a Bailey / Great Wall) is dropped at
 *  the last square it may legally occupy. The units are snapshotted with their starting index first, so
 *  a unit carried forward isn't picked up again further along. Returns every unit that was swept up. */
export function carryAlongPath(ctx: EffectAPI, path: { x: number; y: number }[], excludeId?: string): UnitState[] {
  const lastIdx = path.length - 1
  const swept: { id: string; fromIdx: number }[] = []
  for (let i = 0; i <= lastIdx; i++) {
    for (const u of unitsAt(ctx.state, path[i].x, path[i].y, 'surface')) {
      // an oversized unit spanning several path squares is picked up once, at the first
      if (u.id !== excludeId && !swept.some((s) => s.id === u.id)) swept.push({ id: u.id, fromIdx: i })
    }
  }
  for (const { id, fromIdx } of swept) {
    const u = ctx.state.units[id]
    if (!u) continue
    let idx = fromIdx
    while (idx < lastIdx) {
      const from: Step = { x: path[idx].x, y: path[idx].y, region: 'surface' }
      const to: Step = { x: path[idx + 1].x, y: path[idx + 1].y, region: 'surface' }
      if (!siteEntryAllowed(ctx.state, u, from, to)) break // can't enter the next site → drop here
      idx++
    }
    if (idx > fromIdx) ctx.teleport(id, path[idx].x, path[idx].y)
  }
  return swept.map((s) => ctx.state.units[s.id]).filter((u): u is UnitState => !!u)
}
