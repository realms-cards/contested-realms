import { registerScript, type EffectAPI } from '../registry'
import { GRID_H, GRID_W, edgesConnected, inBounds, occupiedSquares, siteAt } from '../../../engine/grid'
import { isDisabled, regionPresentAt } from '../../../engine/statics'
import { multiSquareDestSquares, siteEntryAllowed, stepDistanceW } from '../../../engine/movement'
import type { GameState, UnitState } from '../../../engine/types'

const DIRS: Record<string, { dx: number; dy: number }> = {
  north: { dx: 0, dy: 1 }, south: { dx: 0, dy: -1 }, east: { dx: 1, dy: 0 }, west: { dx: -1, dy: 0 },
}

/** an ally, or a disabled enemy (avatars are never disabled) */
const slidable = (state: GameState, u: UnitState, player: number) => u.controller === player || isDisabled(state, u)

/** every location the slide could come to rest on, in order along the way. It stops before the edge (or,
 *  under Magellan Globe, crosses it — never back onto its own start), the void, a site where its region
 *  doesn't exist, or a site it can't be pushed into. */
function slidePath(state: GameState, u: UnitState, d: { dx: number; dy: number }): { x: number; y: number }[] {
  const wrap = edgesConnected(state)
  const out: { x: number; y: number }[] = []
  let x = u.x
  let y = u.y
  for (;;) {
    let nx = x + d.dx
    let ny = y + d.dy
    if (!inBounds(nx, ny)) {
      if (!wrap) break
      nx = (nx + GRID_W) % GRID_W
      ny = (ny + GRID_H) % GRID_H
    }
    if (nx === u.x && ny === u.y) break
    if (!siteAt(state, nx, ny) || !regionPresentAt(state, u.region, nx, ny)) break
    if (!siteEntryAllowed(state, u, { x, y, region: u.region }, { x: nx, y: ny, region: u.region }, true, true)) break
    out.push({ x: nx, y: ny })
    x = nx
    y = ny
  }
  return out
}

const oversized = (u: UnitState) => u.size === '2x2' || (u.extraSquares?.length ?? 0) > 0

/** a rigid multi-square body's part offsets from its anchor (a 2x2 is size-based: none) */
const bodyShape = (u: UnitState) => (u.size === '2x2' ? undefined : occupiedSquares(u).map((s) => ({ dx: s.x - u.x, dy: s.y - u.y })))

/** the same for an oversized body: each anchor position, square by square, while its WHOLE footprint fits —
 *  every part on a site (straddling the joined seam under Magellan Globe, as a 2x2 may), each part allowed to
 *  be pushed into its next square — and never back onto its start. */
function bodyPath(state: GameState, u: UnitState, d: { dx: number; dy: number }): { x: number; y: number }[] {
  if (u.region !== 'surface') return []
  const wrap = edgesConnected(state)
  const shape = bodyShape(u)
  const out: { x: number; y: number }[] = []
  let at = { x: u.x, y: u.y }
  let parts = multiSquareDestSquares(state, u, at, shape)
  for (let i = 0; parts && i < GRID_W * GRID_H; i++) {
    let nx = at.x + d.dx
    let ny = at.y + d.dy
    if (!inBounds(nx, ny)) {
      if (!wrap) break
      nx = (nx + GRID_W) % GRID_W
      ny = (ny + GRID_H) % GRID_H
    }
    if (nx === u.x && ny === u.y) break
    const next = multiSquareDestSquares(state, u, { x: nx, y: ny }, shape)
    if (!next) break
    const prev: { x: number; y: number }[] = parts
    if (!next.every((p, k) => siteEntryAllowed(state, u, { ...prev[k], region: 'surface' }, { ...p, region: 'surface' }, true, true))) break
    out.push({ x: nx, y: ny })
    at = { x: nx, y: ny }
    parts = next
  }
  return out
}

/** "as far as possible": the reachable locations farthest from the start (Magellan-aware distance; an
 *  oversized body is measured by its anchor). Off the Globe that's always the last one; across a joined edge
 *  several may tie, and the caster picks (owner ruling). */
function farthest(state: GameState, u: UnitState, d: { dx: number; dy: number }): { x: number; y: number; steps: number }[] {
  const path = (oversized(u) ? bodyPath(state, u, d) : slidePath(state, u, d)).map((s, i) => ({ ...s, steps: i + 1, dist: stepDistanceW(state, u, s) }))
  const best = Math.max(0, ...path.map((p) => p.dist))
  return path.filter((p) => p.dist === best && best > 0).map(({ x, y, steps }) => ({ x, y, steps }))
}

function slideTo(ctx: EffectAPI, u: UnitState, d: { dx: number; dy: number }, to: { x: number; y: number; steps: number }, dir: string): void {
  const from = { x: u.x, y: u.y }
  if (oversized(u)) {
    // a body is pushed one square at a time (each step relays its whole rigid footprint, wrapped)
    const shape = bodyShape(u)
    for (let i = 0; i < to.steps; i++) {
      const cur = ctx.state.units[u.id]
      if (!cur) break
      const nx = (cur.x + d.dx + GRID_W) % GRID_W
      const ny = (cur.y + d.dy + GRID_H) % GRID_H
      if (!ctx.teleport(cur.id, nx, ny, cur.region, { push: true, shape })) break
    }
  } else ctx.teleport(u.id, to.x, to.y, u.region, { push: true, walk: { dx: d.dx, dy: d.dy, steps: to.steps } })
  const now = ctx.state.units[u.id]
  if (now && (now.x !== from.x || now.y !== from.y)) ctx.log(`${now.name} slides ${dir}.`)
}

// 'Slide an ally or disabled enemy as far as possible in a cardinal direction. Draw a spell.'
// "An ally" isn't a target (no Stealth/Ward), so the pick is untargeted. A slide is forced movement that
// takes steps (a push): it stays in the unit's own region (FAQ: it can't push a minion into the void),
// passes through every square on the way (their enter/leave triggers fire) and stops at whatever stops it
// (slidePath). Under Magellan Globe it crosses the joined edges; "as far as possible" is then the reachable
// location farthest from the start by wrapped step distance, the caster choosing among ties (owner ruling).
// "Can't be moved by force" holds it in place. An oversized body slides the same way, its whole rigid
// footprint moving square by square while every part fits (straddling the joined seam under the Globe),
// "farthest" measured by its anchor (offered on a tie).
registerScript('Slide', {
  targets: [{
    what: 'unit', count: 1, targeted: false, owner: 'any', label: 'an ally or disabled enemy',
    filter: (state, u, source) => slidable(state, u, source.controller),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    const u = t && 'unit' in t ? ctx.state.units[t.unit] : undefined
    if (!u) return ctx.draw(ctx.controller, 'spellbook', 1)
    ctx.ask({ kind: 'chooseOption', title: `Slide ${u.name} which way?`, data: { options: Object.keys(DIRS) } }, 'dir', { unitId: u.id })
  },
  conts: {
    dir: (ctx, c, choice) => {
      const d = typeof choice === 'string' ? DIRS[choice] : undefined
      const u = ctx.state.units[c.unitId as string]
      if (d && u && slidable(ctx.state, u, ctx.controller)) {
        const ends = farthest(ctx.state, u, d)
        if (ends.length === 1) slideTo(ctx, u, d, ends[0], choice as string)
        else if (ends.length > 1) {
          ctx.ask({ kind: 'chooseSquare', title: `Slide ${u.name} — the farthest locations tie. Which one?`, data: { squares: ends.map(({ x, y }) => ({ x, y })) } }, 'end', { unitId: u.id, dir: choice })
          return // the spell is drawn once the slide resolves
        }
      }
      ctx.draw(ctx.controller, 'spellbook', 1)
    },
    end: (ctx, c, sq) => {
      const d = DIRS[c.dir as string]
      const u = ctx.state.units[c.unitId as string]
      if (d && u && sq && slidable(ctx.state, u, ctx.controller)) {
        const pick = farthest(ctx.state, u, d).find((e) => e.x === sq.x && e.y === sq.y)
        if (pick) slideTo(ctx, u, d, pick, c.dir as string)
      }
      ctx.draw(ctx.controller, 'spellbook', 1)
    },
  },
})
