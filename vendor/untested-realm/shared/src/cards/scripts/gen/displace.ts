import { registerScript, type EffectAPI } from '../registry'
import type { GameState, Region } from '../../../engine/types'
import { nearbySquaresW, adjacentSquaresW, orthAdjacentWrapped, siteAt, aura2x2Squares, edgesConnected, GRID_W, GRID_H } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import { regionPresentAt } from '../../../engine/statics'

// 'Teleport target minion, artifact, or aura one diagonal step.'
// Every printed target type is supported. The DESTINATION picker matches how each thing is placed:
//  • minion / artifact → a diagonal location in its own region (a carried artifact is dropped there, off
//    its bearer). FAQ: "steps are only measured within the same region" — not from a site to the void.
//  • single-site aura (Wildfire…) → any diagonal square. FAQ: an aura ignores the surface/void boundary.
//  • 2×2 aura → a diagonal INTERSECTION anchor (Magellan-aware), shifting its whole 2×2
//  • wall (edge) aura → a nearby SITE BORDER
type Anchor = { x: number; y: number }
const key = (e: { a: Anchor; b: Anchor }) => [Math.min(e.a.x, e.b.x), Math.min(e.a.y, e.b.y), Math.max(e.a.x, e.b.x), Math.max(e.a.y, e.b.y)].join(',')

registerScript('Displace', {
  targets: [{ what: 'minionArtifactOrAura', count: 1, targeted: true, label: 'target minion, artifact, or aura' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('aura' in t) { offerAuraDestination(ctx, t.aura); return }
    // minion / artifact anchor and region (a carried artifact rides its carrier's location)
    let at: { x: number; y: number; region: Region }
    if ('unit' in t) { const u = ctx.state.units[t.unit]; if (!u) return; at = { x: u.x, y: u.y, region: u.region } }
    else if ('artifact' in t) {
      const a = ctx.state.artifacts[t.artifact]; if (!a) return
      const carrier = a.carriedBy ? ctx.state.units[a.carriedBy] : null
      at = { x: a.x, y: a.y, region: carrier?.region ?? a.region }
    } else return
    const squares = diagonalSquares(ctx.state, at.x, at.y).filter((s) => regionPresentAt(ctx.state, at.region, s.x, s.y))
    if (!squares.length) return
    ctx.ask(
      { kind: 'chooseSquare', title: 'Displace to which diagonal square?', data: { squares } },
      'slip',
      'unit' in t ? { unitId: t.unit, region: at.region } : { artifactId: t.artifact, region: at.region },
    )
  },
  conts: {
    // minion / artifact → a diagonal location in its region; single-site aura → a diagonal square
    slip: (ctx, contCtx, choice) => {
      const to = choice as Anchor
      if (!to || typeof to.x !== 'number' || typeof to.y !== 'number') return
      const where = siteAt(ctx.state, to.x, to.y)?.name ?? 'the void'
      const region = contCtx.region as Region | undefined
      if (region && !regionPresentAt(ctx.state, region, to.x, to.y)) return
      if (contCtx.unitId) {
        const u = ctx.state.units[contCtx.unitId]
        if (u && region && u.region === region) ctx.teleport(u.id, to.x, to.y, region)
      } else if (contCtx.artifactId) {
        const a = ctx.state.artifacts[contCtx.artifactId]
        if (!a || !region) return
        const carrier = a.carriedBy ? ctx.state.units[a.carriedBy] : null
        a.x = to.x; a.y = to.y; a.region = region
        if (carrier && (carrier.x !== a.x || carrier.y !== a.y)) {
          carrier.carrying = carrier.carrying.filter((id) => id !== a.id)
          a.carriedBy = null
          pushLog(ctx.state, ctx.controller, `${a.name} is displaced from ${carrier.name} and drops onto ${where}.`)
        }
      } else if (contCtx.auraId) {
        const r = ctx.state.auras[contCtx.auraId]
        if (r) { r.squares = [{ x: to.x, y: to.y }]; pushLog(ctx.state, ctx.controller, `${r.name} shifts one step onto ${where}.`) }
      }
    },
    // 2×2 aura → a diagonal INTERSECTION anchor: shift the whole footprint
    slipAura: (ctx, contCtx, choice) => {
      const r = ctx.state.auras[contCtx.auraId]
      const to = choice as Anchor
      if (!r || !to || typeof to.x !== 'number') return
      const wrap = edgesConnected(ctx.state)
      r.squares = aura2x2Squares({ x: to.x, y: to.y }, wrap)
      ;(r as any).anchor = { x: to.x, y: to.y }
      pushLog(ctx.state, ctx.controller, `${r.name} grinds one step to a new intersection.`)
    },
    // wall (edge) aura → a nearby SITE BORDER
    slipWall: (ctx, contCtx, choice) => {
      const r = ctx.state.auras[contCtx.auraId]
      const edges: { a: Anchor; b: Anchor }[] = contCtx.edges ?? []
      const pickKey = typeof choice === 'string' ? choice : (choice as any)?.key
      const e = edges.find((ed) => key(ed) === pickKey)
      if (!r || !e) return
      r.edge = { a: e.a, b: e.b }
      pushLog(ctx.state, ctx.controller, `${r.name} slides one step to an adjacent border.`)
    },
  },
})

// the four diagonal squares of (x,y) — Magellan-Globe aware. The diagonals are `nearby (self+8) MINUS
// adjacent (self+4 orthogonal)`, which stays correct under wrap (a naive `abs(dx)===1 && abs(dy)===1`
// filter would reject the wrapped-edge diagonals).
function diagonalSquares(state: GameState, x: number, y: number): Anchor[] {
  const orth = adjacentSquaresW(state, x, y)
  return nearbySquaresW(state, x, y).filter((s) => !orth.some((o) => o.x === s.x && o.y === s.y))
}

function offerAuraDestination(ctx: EffectAPI, auraId: string): void {
  const r = ctx.state.auras[auraId]
  if (!r) return
  const wrap = edgesConnected(ctx.state)
  if (r.edge) {
    // WALL: offer the borders of sites near the wall's two squares (dedup by edge, drop the current one)
    const near = [...nearbySquaresW(ctx.state, r.edge.a.x, r.edge.a.y), ...nearbySquaresW(ctx.state, r.edge.b.x, r.edge.b.y)]
    const cur = key(r.edge)
    const seen = new Set<string>()
    const edges: { a: Anchor; b: Anchor }[] = []
    for (const sq of near) {
      if (!siteAt(ctx.state, sq.x, sq.y)) continue // a border needs a site on at least one side
      for (const nb of orthAdjacentWrapped(ctx.state, sq.x, sq.y)) { // border to any wrapped-adjacent square (Magellan)
        const e = { a: { x: sq.x, y: sq.y }, b: { x: nb.x, y: nb.y } }
        const k = key(e)
        if (k === cur || seen.has(k)) continue
        seen.add(k)
        edges.push(e)
      }
    }
    if (!edges.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Displace the wall to which border?', data: { edgeSelect: true, edges: edges.map((e) => ({ ...e, key: key(e) })) } }, 'slipWall', { auraId, edges })
    return
  }
  if ((r.squares?.length ?? 0) <= 1) {
    // SINGLE-SITE aura (Wildfire): any diagonal square, a void included (FAQ)
    const sq = r.squares?.[0]
    if (!sq) return
    const squares = diagonalSquares(ctx.state, sq.x, sq.y)
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Displace to which diagonal square?', data: { squares } }, 'slip', { auraId })
    return
  }
  // 2×2 aura: a diagonal INTERSECTION anchor (Magellan-aware). Its anchor is its top-left square.
  const ax = (r as any).anchor?.x ?? Math.min(...r.squares.map((s) => s.x))
  const ay = (r as any).anchor?.y ?? Math.min(...r.squares.map((s) => s.y))
  const anchors: Anchor[] = []
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const na = { x: ax + dx, y: ay + dy }
    const sq = aura2x2Squares(na, wrap)
    // a valid diagonal anchor covers four in-bounds squares (wrap already folds edges in)
    if (sq.length === 4 && sq.every((s) => s.x >= 0 && s.y >= 0 && s.x < GRID_W && s.y < GRID_H)) anchors.push(na)
  }
  if (!anchors.length) return
  ctx.ask({ kind: 'chooseSquare', title: 'Displace the aura to which intersection?', data: { area2x2: true, squares: anchors } }, 'slipAura', { auraId })
}
