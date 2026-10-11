import { type EffectAPI } from '../registry'
import { GRID_H, GRID_W, inBounds, siteAt, unitsAt, edgesConnected } from '../../../engine/grid'
import { recordAreaReveal } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'
import type { GameState, Region } from '../../../engine/types'

export type Cell = { dx: number; dy: number; dmg: number }

export type Dir = 'n' | 's' | 'e' | 'w'

/** rotate a "facing north" offset into the chosen direction */
export function rot(dir: Dir, dx: number, dy: number): { dx: number; dy: number } {
  switch (dir) {
    case 'n': return { dx, dy }
    case 's': return { dx: -dx, dy: -dy }
    case 'e': return { dx: dy, dy: -dx }
    case 'w': return { dx: -dy, dy: dx }
  }
}

interface GridOpts {
  region?: Region | 'allRegions'
  enemiesOnly?: boolean
  skipUnitId?: string
  lethal?: boolean
  atopSitesOnly?: boolean
  banishEvil?: boolean
}

/**
 * Resolve a printed pattern into ABSOLUTE damaged squares, applying the direction
 * rotation, bounds, and the `atopSitesOnly` gate. Shared by `applyGrid` (which
 * then damages the units on those squares) and the preview (which shows the
 * printed damage on each). `atopSitesOnly` is honored so the overlay only lights
 * squares that actually have a site — exactly the squares the cast would hit. */
export function resolveCells(
  state: GameState,
  origin: { x: number; y: number },
  cells: Cell[],
  dir: Dir,
  opts: Pick<GridOpts, 'atopSitesOnly'> = {},
): { x: number; y: number; dmg: number }[] {
  // Magellan Globe: the damage grid spans the edges of the realm (FAQ 2). A cell that falls off the
  // board wraps to the opposite side; dedupe by square (keeping the larger blast) so a wrap-collision
  // can't double-count. Without the Globe an off-board cell is simply clipped, as before.
  const wrap = edgesConnected(state)
  const byKey = new Map<string, { x: number; y: number; dmg: number }>()
  for (const cell of cells) {
    const r = rot(dir, cell.dx, cell.dy)
    let x = origin.x + r.dx
    let y = origin.y + r.dy
    if (!inBounds(x, y)) {
      if (!wrap) continue
      x = ((x % GRID_W) + GRID_W) % GRID_W
      y = ((y % GRID_H) + GRID_H) % GRID_H
    }
    if (opts.atopSitesOnly && !siteAt(state, x, y)) continue
    const k = `${x},${y}`
    const ex = byKey.get(k)
    if (!ex || cell.dmg > ex.dmg) byKey.set(k, { x, y, dmg: cell.dmg })
  }
  return [...byKey.values()]
}

/** a 5x5 (Manhattan) diamond of cells whose damage falls off by ring distance */
export function diamondCells(ring: (d: number) => number): Cell[] {
  const cells: Cell[] = []
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const dmg = ring(Math.abs(dx) + Math.abs(dy))
      if (dmg > 0) cells.push({ dx, dy, dmg })
    }
  }
  return cells
}

/** collapse duplicate squares from overlapping patterns, keeping the larger blast */
export function mergeCells(cells: { x: number; y: number; dmg: number }[]): { x: number; y: number; dmg: number }[] {
  const byKey = new Map<string, { x: number; y: number; dmg: number }>()
  for (const c of cells) {
    const k = `${c.x},${c.y}`
    const prev = byKey.get(k)
    if (!prev || c.dmg > prev.dmg) byKey.set(k, c)
  }
  return [...byKey.values()]
}

export function applyGrid(ctx: EffectAPI, origin: { x: number; y: number }, cells: Cell[], dir: Dir, opts: GridOpts = {}) {
  const region = opts.region === 'allRegions' ? undefined : opts.region ?? ctx.caster?.region ?? 'surface'
  const resolved = resolveCells(ctx.state, origin, cells, dir, opts)
  recordAreaReveal(ctx.state, resolved) // the whole printed area lights up in the both-player reveal
  // Day of Judgment (FAQ): ALL Evil minions across the whole area are banished FIRST — resolving
  // any "when this leaves the realm" effects — and only THEN is damage dealt to what remains. So
  // banishEvil runs as a separate first pass over every cell before the damage loop below.
  if (opts.banishEvil) {
    for (const cell of resolved) {
      for (const u of unitsAt(ctx.state, cell.x, cell.y, region as Region | undefined)) {
        if (u.isAvatar) continue
        if (opts.skipUnitId && u.id === opts.skipUnitId) continue
        if (opts.enemiesOnly && u.controller === ctx.controller) continue
        const st = effSubtypes(ctx.state, u)
        if (st.includes('Demon') || st.includes('Undead') || st.includes('Monster')) ctx.banish(u.id)
      }
    }
  }
  // Damage is simultaneous across the whole blast: the engine holds an open damage event around the
  // spell/ability resolving this, so no victim is removed until every hit's reduction/prevention has
  // resolved (a Shield Maidens caught in its own blast still shields the allies beside it).
  for (const cell of resolved) {
    const x = cell.x
    const y = cell.y
    for (const u of unitsAt(ctx.state, x, y, region as Region | undefined)) {
      if (opts.skipUnitId && u.id === opts.skipUnitId) continue
      if (opts.enemiesOnly && u.controller === ctx.controller) continue
      // (Evil minions, if any, were already banished in the pre-pass above.)
      if (opts.lethal) {
        if (!u.isAvatar) {
          ctx.dealDamage({ unit: u.id }, 1)
          if (ctx.state.units[u.id]) ctx.kill(u.id)
        } else {
          ctx.dealDamage({ unit: u.id }, cell.dmg)
        }
      } else {
        ctx.dealDamage({ unit: u.id }, cell.dmg)
      }
    }
  }
}

export const CROSS_3X3: Cell[] = [
  { dx: 0, dy: 0, dmg: 7 },
  { dx: 1, dy: 0, dmg: 5 }, { dx: -1, dy: 0, dmg: 5 }, { dx: 0, dy: 1, dmg: 5 }, { dx: 0, dy: -1, dmg: 5 },
  { dx: 1, dy: 1, dmg: 3 }, { dx: -1, dy: 1, dmg: 3 }, { dx: 1, dy: -1, dmg: 3 }, { dx: -1, dy: -1, dmg: 3 },
]
