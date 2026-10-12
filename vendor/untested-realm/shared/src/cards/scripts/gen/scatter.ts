import { registerScript, type EffectAPI } from '../registry'
import { orthAdjacentWrapped, siteAt, unitsAt, isOrthAdjacent, aura2x2Squares, edgesConnected, inBounds } from '../../../engine/grid'
import { isCarriableArtifact } from '../../../engine/statics'

const edgeKey = (e: { a: { x: number; y: number }; b: { x: number; y: number } }) =>
  [Math.min(e.a.x, e.b.x), Math.min(e.a.y, e.b.y), Math.max(e.a.x, e.b.x), Math.max(e.a.y, e.b.y)].join(',')

// 'Push everything at target location one step, one at a time.'
// "Everything" = the units, the ground artifacts, AND the auras occupying the square (the site itself
// is NOT pushed — FAQ). Each is offered its own one-step push destination, resolved one at a time.
registerScript('Scatter', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('square' in t)) return
    scatterNext(ctx, t.square.x, t.square.y, [])
  },
  conts: {
    // a UNIT pushed to the chosen adjacent site
    where: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq && isOrthAdjacent({ x: sq.x, y: sq.y }, { x: u.x, y: u.y })) ctx.teleport(u.id, sq.x, sq.y, u.region, { push: true }) // a scatter/push, not a Teleport (Cage of Sidrak)
      scatterNext(ctx, c.x as number, c.y as number, [...(c.done as string[]), c.unitId as string])
    },
    // a ground ARTIFACT pushed to the chosen adjacent site
    artWhere: (ctx, c, sq) => {
      const a = ctx.state.artifacts[c.artId as string]
      if (a && sq && siteAt(ctx.state, sq.x, sq.y) && isOrthAdjacent({ x: sq.x, y: sq.y }, { x: a.x, y: a.y })) { a.x = sq.x; a.y = sq.y; a.region = 'surface' }
      scatterNext(ctx, c.x as number, c.y as number, [...(c.done as string[]), c.artId as string])
    },
    // a single-site AURA (Wildfire…) pushed to the chosen adjacent site
    auraWhere: (ctx, c, sq) => {
      const r = ctx.state.auras[c.auraId as string]
      if (r && sq && siteAt(ctx.state, sq.x, sq.y)) r.squares = [{ x: sq.x, y: sq.y }]
      scatterNext(ctx, c.x as number, c.y as number, [...(c.done as string[]), c.auraId as string])
    },
    // a 2×2 AURA shifted one orthogonal step (new anchor)
    aura2Where: (ctx, c, anchor: any) => {
      const r = ctx.state.auras[c.auraId as string]
      if (r && anchor && typeof anchor.x === 'number') { r.squares = aura2x2Squares({ x: anchor.x, y: anchor.y }, edgesConnected(ctx.state)); r.anchor = { x: anchor.x, y: anchor.y } }
      scatterNext(ctx, c.x as number, c.y as number, [...(c.done as string[]), c.auraId as string])
    },
    // a WALL (edge aura) slid one step to the chosen adjacent border
    wallWhere: (ctx, c, choice: any) => {
      const r = ctx.state.auras[c.auraId as string]
      const edges = (c.edges as { a: { x: number; y: number }; b: { x: number; y: number } }[]) ?? []
      const pick = typeof choice === 'string' ? choice : choice?.key
      const e = edges.find((ed) => edgeKey(ed) === pick)
      if (r && e) r.edge = { a: e.a, b: e.b }
      scatterNext(ctx, c.x as number, c.y as number, [...(c.done as string[]), c.auraId as string])
    },
  },
})

function scatterNext(ctx: EffectAPI, x: number, y: number, done: string[]): void {
  // 1) UNITS at the location, one at a time. A push can't shove a unit into the void — its "one step"
  // must reach a real adjacent LOCATION (a sited square), so siteless squares are never offered.
  let unit = unitsAt(ctx.state, x, y).find((u) => !done.includes(u.id))
  while (unit) {
    const squares = orthAdjacentWrapped(ctx.state, unit.x, unit.y).filter((s) => siteAt(ctx.state, s.x, s.y))
    if (squares.length) {
      ctx.ask({ kind: 'chooseSquare', title: `Scatter: where is ${unit.name} pushed?`, data: { squares } }, 'where', { unitId: unit.id, x, y, done })
      return
    }
    done = [...done, unit.id] // nowhere legal to push this one — leave it and move on
    unit = unitsAt(ctx.state, x, y).find((u) => !done.includes(u.id))
  }
  // 2) ground ARTIFACTS at the location (carried ones ride their bearer; immovable Monuments/Automatons stay)
  for (const a of Object.values(ctx.state.artifacts)) {
    if (a.carriedBy || a.x !== x || a.y !== y || done.includes(a.id) || !isCarriableArtifact(a.name)) continue
    const squares = orthAdjacentWrapped(ctx.state, a.x, a.y).filter((s) => siteAt(ctx.state, s.x, s.y))
    if (!squares.length) { done = [...done, a.id]; continue }
    ctx.ask({ kind: 'chooseSquare', title: `Scatter: where is ${a.name} pushed?`, data: { squares } }, 'artWhere', { artId: a.id, x, y, done })
    return
  }
  // 3) AURAS occupying the location (single-site / 2×2 / wall), one at a time
  for (const r of Object.values(ctx.state.auras)) {
    if (done.includes(r.id)) continue
    if (r.edge) {
      // WALL: it must border the target square
      if (!((r.edge.a.x === x && r.edge.a.y === y) || (r.edge.b.x === x && r.edge.b.y === y))) continue
      const edges = wallSlides(ctx, r.edge)
      if (!edges.length) { done = [...done, r.id]; continue }
      ctx.ask({ kind: 'chooseSquare', title: `Scatter: where is ${r.name} pushed?`, data: { edgeSelect: true, edges: edges.map((e) => ({ ...e, key: edgeKey(e) })) } }, 'wallWhere', { auraId: r.id, edges, x, y, done })
      return
    }
    if (!r.squares.some((s) => s.x === x && s.y === y)) continue // not on the target square
    if (r.squares.length <= 1) {
      // single-site aura → an adjacent site
      const squares = orthAdjacentWrapped(ctx.state, x, y).filter((s) => siteAt(ctx.state, s.x, s.y))
      if (!squares.length) { done = [...done, r.id]; continue }
      ctx.ask({ kind: 'chooseSquare', title: `Scatter: where is ${r.name} pushed?`, data: { squares } }, 'auraWhere', { auraId: r.id, x, y, done })
      return
    }
    // 2×2 aura → shift its top-left anchor one orthogonal step (Magellan-aware, in-bounds)
    const ax = r.anchor?.x ?? Math.min(...r.squares.map((s) => s.x))
    const ay = r.anchor?.y ?? Math.min(...r.squares.map((s) => s.y))
    const wrap = edgesConnected(ctx.state)
    const anchors = orthAdjacentWrapped(ctx.state, ax, ay).filter((na) => {
      const sq = aura2x2Squares({ x: na.x, y: na.y }, wrap)
      return sq.length === 4 && sq.every((s) => inBounds(s.x, s.y))
    })
    if (!anchors.length) { done = [...done, r.id]; continue }
    ctx.ask({ kind: 'chooseSquare', title: `Scatter: where is ${r.name} pushed?`, data: { area2x2: true, squares: anchors } }, 'aura2Where', { auraId: r.id, x, y, done })
    return
  }
  // nothing left to scatter
}

/** a wall pushed "one step" slides one square along its separating axis (toward a, or toward b); only
 *  borders that still touch a site are offered. */
function wallSlides(ctx: EffectAPI, edge: { a: { x: number; y: number }; b: { x: number; y: number } }) {
  const out: { a: { x: number; y: number }; b: { x: number; y: number } }[] = []
  const slide = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const nb = { x: to.x + (to.x - from.x), y: to.y + (to.y - from.y) } // one step beyond `to`
    if (!inBounds(nb.x, nb.y)) return
    if (!siteAt(ctx.state, to.x, to.y) && !siteAt(ctx.state, nb.x, nb.y)) return // a border needs a site on a side
    out.push({ a: to, b: nb })
  }
  slide(edge.a, edge.b)
  slide(edge.b, edge.a)
  return out
}
