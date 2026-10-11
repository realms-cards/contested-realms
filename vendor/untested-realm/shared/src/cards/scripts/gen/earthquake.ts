import { registerScript, type EffectAPI } from '../registry'
import type { GameState } from '../../../engine/types'
import { pushLog, checkStateBased, siteCantBeMoved, notifySiteInterference } from '../../../engine/effects'
import { GRID_H, GRID_W, siteAt, unitsAt, aura2x2Squares, edgesConnected, isWaterSite } from '../../../engine/grid'
import { footprintAllTerrain } from '../../../engine/statics'
import { syncCarried, buryArtifactsAt } from '../../../engine/carrying'
import { getScript } from '../registry'
import { getCard } from '../../db'

// 'You may rearrange sites within a two-by-two area, carrying along everything of normal size.
// Then burrow all minions and artifacts on those sites.'
//
// The rearrangement is a straight 4→4 PERMUTATION, not an engine-driven chain of pairwise swaps:
// the client builds whatever final arrangement it likes (its swap UI is purely a way to author the
// permutation) and sends it in one shot. The engine only validates it (a bijection of the area that
// keeps immovable sites — Bedrock, a Bluecap Knockers site — on their own squares and strands no
// placement-restricted site) and relocates every site with its normal-size contents simultaneously.
// Void squares stay void; they just travel like anything else. This makes Earthquake trivial for the
// bot too — it can answer with the identity permutation (rearrange nothing).
registerScript('Earthquake', {
  onCast: (ctx) => {
    // First: pick the two-by-two AREA. Every anchor whose 2×2 holds at least one site is offered,
    // rendered as intersection markers (area2x2), the same 2×2 selector auras use.
    const wrap = edgesConnected(ctx.state) // Globe: edge anchors are legal, the 2×2 wraps
    const maxX = wrap ? GRID_W : GRID_W - 1
    const maxY = wrap ? GRID_H : GRID_H - 1
    const squares: { x: number; y: number }[] = []
    for (let x = 0; x < maxX; x++) for (let y = 0; y < maxY; y++) {
      if (areaSquares(ctx.state, { ax: x, ay: y }).some((s) => siteAt(ctx.state, s.x, s.y))) squares.push({ x, y })
    }
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Earthquake: choose the two-by-two area.', data: { squares, area2x2: true } }, 'area')
  },
  conts: {
    area: (ctx, _c, sq) => {
      const wrap = edgesConnected(ctx.state)
      if (!sq || sq.x < 0 || sq.y < 0 || sq.x >= (wrap ? GRID_W : GRID_W - 1) || sq.y >= (wrap ? GRID_H : GRID_H - 1)) return
      const c = { ax: sq.x, ay: sq.y }
      const area = areaSquares(ctx.state, c)
      // squares whose site is immovable are fixed points of the permutation (never offered to move)
      const movable = area.filter((s) => {
        const site = siteAt(ctx.state, s.x, s.y)
        return !site || !siteCantBeMoved(ctx.state, site)
      })
      // if at most one square can move, there's no rearrangement to make — go straight to the burrow
      if (movable.length < 2) return finishQuake(ctx, c)
      // cells carry each square's current site (name) + whether it may move, so the client can render
      // and author the permutation entirely on its own; `squares` is kept for the bot's identity answer.
      const cells = area.map((s) => {
        const site = siteAt(ctx.state, s.x, s.y)
        return { x: s.x, y: s.y, name: site && !site.isRubble ? site.name : site?.isRubble ? 'Rubble' : null, movable: !site || !siteCantBeMoved(ctx.state, site) }
      })
      ctx.ask(
        { kind: 'sitePermutation', title: 'Earthquake: rearrange the sites in the area.', data: { squares: area, movable, cells } },
        'permute',
        c,
      )
    },
    // The client sends the FINAL arrangement: choice.placements = [{ x, y, sx, sy }] — the square (x,y)
    // receives the site (and contents) currently at (sx,sy). An absent/empty answer = rearrange nothing.
    permute: (ctx, c, choice) => {
      const placements = Array.isArray((choice as any)?.placements) ? (choice as any).placements : []
      if (placements.length) applyPermutation(ctx, c, placements)
      finishQuake(ctx, c)
    },
  },
})

// the 2×2 anchored at (ax,ay), clipped to the board — or edge-WRAPPED under Magellan Globe
function areaSquares(state: GameState, c: any): { x: number; y: number }[] {
  return aura2x2Squares({ x: c.ax, y: c.ay }, edgesConnected(state))
}

type Cap = {
  x: number; y: number
  site: ReturnType<typeof siteAt>
  units: GameState['units'][string][]
  arts: GameState['artifacts'][string][]
  auras: GameState['auras'][string][]
}

// Validate the client's permutation and, if legal, relocate every site + its normal-size contents
// (units in all regions, loose artifacts, 1×1 auras atop it) simultaneously. A permutation that
// moves an immovable site or strands a placement-restricted site (Edge of the World must stay
// adjacent to the void) is rejected wholesale — nothing moves (the client shouldn't have sent it).
function applyPermutation(ctx: EffectAPI, c: any, placements: { x: number; y: number; sx: number; sy: number }[]): void {
  const state = ctx.state
  const area = areaSquares(state, c)
  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
  const areaSet = new Set(area.map(key))
  const bad = (why: string) => pushLog(state, ctx.controller, `Earthquake: ${why} — nothing is rearranged.`)

  // shape check: a bijection of exactly the area squares
  if (placements.length !== area.length) return bad('malformed rearrangement')
  const dests = new Set(placements.map((p) => key({ x: p.x, y: p.y })))
  const srcs = new Set(placements.map((p) => key({ x: p.sx, y: p.sy })))
  if (dests.size !== area.length || srcs.size !== area.length) return bad('not a permutation')
  if (![...dests].every((k) => areaSet.has(k)) || ![...srcs].every((k) => areaSet.has(k))) return bad('outside the area')
  // immovable sites (and the squares they'd be displaced from/to) must be fixed points
  for (const p of placements) {
    const fixed = p.x === p.sx && p.y === p.sy
    const src = siteAt(state, p.sx, p.sy)
    const dst = siteAt(state, p.x, p.y)
    if (!fixed && ((src && siteCantBeMoved(state, src)) || (dst && siteCantBeMoved(state, dst)))) return bad('an immovable site would move')
  }

  // capture each source square's contents + original coords, keyed by source square
  const cap: Cap[] = area.map((sq) => ({
    x: sq.x, y: sq.y,
    site: siteAt(state, sq.x, sq.y),
    units: Object.values(state.units).filter((u) => u.x === sq.x && u.y === sq.y && !(getScript(u.name)?.oversized && !u.silenced)),
    arts: Object.values(state.artifacts).filter((a) => !a.carriedBy && a.x === sq.x && a.y === sq.y),
    auras: Object.values(state.auras).filter((r) => getScript(r.name)?.singleSiteAura && r.squares.length === 1 && r.squares[0].x === sq.x && r.squares[0].y === sq.y),
  }))
  const bySrc = new Map(cap.map((c0) => [key(c0), c0]))
  const preMove = cap.filter((c0) => c0.site).map((c0) => ({ id: c0.site!.id, x: c0.x, y: c0.y, controller: c0.site!.controller }))

  // relocate simultaneously (contents were captured by their ORIGINAL square first)
  for (const p of placements) {
    const src = bySrc.get(key({ x: p.sx, y: p.sy }))
    if (!src) continue
    if (src.site) { src.site.x = p.x; src.site.y = p.y }
    for (const u of src.units) { u.x = p.x; u.y = p.y }
    for (const a of src.arts) { a.x = p.x; a.y = p.y }
    for (const r of src.auras) r.squares = [{ x: p.x, y: p.y }]
  }

  // a rearrangement that strands a placement-restricted site is illegal — restore everything
  if (area.some((sq) => quakeStrands(state, sq))) {
    for (const c0 of cap) {
      if (c0.site) { c0.site.x = c0.x; c0.site.y = c0.y }
      for (const u of c0.units) { u.x = c0.x; u.y = c0.y }
      for (const a of c0.arts) { a.x = c0.x; a.y = c0.y }
      for (const r of c0.auras) r.squares = [{ x: c0.x, y: c0.y }]
    }
    return bad('that arrangement would strand a site')
  }
  for (const pre of preMove) {
    const now = siteAt(state, pre.x, pre.y)
    if (!now || now.id !== pre.id) notifySiteInterference(state, 'move', pre, ctx.controller) // only sites that actually moved
  }
  pushLog(state, ctx.controller, 'The earth heaves — the sites grind into a new arrangement.')
}

// The final step — "burrow all minions and artifacts on those sites". Same as Cave-In, across the whole
// 2×2: every minion that can burrow (not an oversized unit straddling non-land) AND every loose artifact
// on a land site goes underground; a water site has no underground so its contents stay put.
function finishQuake(ctx: EffectAPI, c: any): void {
  for (const s of areaSquares(ctx.state, c)) {
    const site = siteAt(ctx.state, s.x, s.y)
    if (!site || isWaterSite(ctx.state, site, getCard)) continue
    for (const u of unitsAt(ctx.state, s.x, s.y, 'surface')) {
      if (!u.isAvatar && footprintAllTerrain(ctx.state, u, 'land')) { u.region = 'underground'; syncCarried(ctx.state, u) }
    }
    buryArtifactsAt(ctx.state, s.x, s.y) // loose AND carried artifacts (carried on a non-buriable bearer are detached)
  }
  pushLog(ctx.state, ctx.controller, 'The quake swallows everything into the earth.')
  checkStateBased(ctx.state)
}

// does the site now at (x,y) violate its own placement restriction? (Edge of the
// World: "Must always be adjacent to the void.")
function quakeStrands(state: GameState, at: { x: number; y: number }): boolean {
  const site = siteAt(state, at.x, at.y)
  if (!site) return false
  const restrict = getScript(site.name)?.sitePlacement
  return !!restrict && restrict(state, site.controller ?? 0, { x: site.x, y: site.y }) === 'deny'
}
