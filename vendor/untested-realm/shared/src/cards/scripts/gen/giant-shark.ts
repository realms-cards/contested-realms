import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'
import { pushLog, emitUnitMoved } from '../../../engine/effects'
import { fightUnits } from '../../../engine/combat'
import { isLegalStep } from '../../../engine/movement'
import { siteAt, isWaterSite, adjacentSquaresW, nearbySquaresW, squareLabel } from '../../../engine/grid'
import { getCard } from '../../db'
import { bodyOfWaterAt } from './util'
import type { EffectAPI } from '../registry'
import type { GameState, Region, UnitState } from '../../../engine/types'

// 'Submerge, Waterbound / Whenever another unit enters or moves between sites in this body of water, Giant
//  Shark moves to that unit to fight it.'
//
// The Shark doesn't teleport: it takes the SHORTEST legal path to the prey, one step at a time (each step
// costs 1; a diagonal only if the mover is Airborne). Because it is Waterbound, the path may only run over
// WATER sites — a route that would leave the water can't be taken. If NO water path reaches the prey (e.g.
// an Iceberg blocks the only surface/submerge step), the Shark does not move and does not fight. When two
// steps tie for shortest, its controller chooses the route.

type Node = { x: number; y: number; region: Region }
const K = (n: Node) => `${n.x},${n.y},${n.region}`

// Every legal single step from `n`, restricted to WATER sites (Waterbound). Uses the engine's own step
// legality (walls, Iceberg's block on surfacing/submerging, adjacency, region rules).
function waterSteps(state: GameState, shark: UnitState, n: Node): Node[] {
  const air = !!effKeywords(state, shark).airborne
  const out: Node[] = []
  // own square + orthogonal (or all 8 if Airborne), Magellan-aware; the own square yields the vertical
  // surface<->underwater step. isLegalStep enforces the real rules (walls, Iceberg, region legality).
  for (const { x, y } of air ? nearbySquaresW(state, n.x, n.y) : adjacentSquaresW(state, n.x, n.y)) {
    const site = siteAt(state, x, y)
    if (!site || !isWaterSite(state, site, getCard)) continue // Waterbound: water sites only
    for (const region of ['surface', 'underwater'] as Region[]) {
      const to = { x, y, region }
      if (K(to) === K(n)) continue
      if (isLegalStep(state, shark, n, to)) out.push(to)
    }
  }
  return out
}

// BFS the step-distance from every water node TO `goal`, following steps in reverse (m precedes n when the
// Shark could legally step m→n). Lets us walk the Shark greedily toward the prey and offer a choice on ties.
function distToGoal(state: GameState, shark: UnitState, goal: Node): Map<string, number> {
  const dist = new Map<string, number>([[K(goal), 0]])
  let frontier: Node[] = [goal]
  while (frontier.length) {
    const next: Node[] = []
    for (const n of frontier) {
      const d = dist.get(K(n))! + 1
      // candidate predecessors: own square + all 8 neighbours (Magellan-aware), kept only if a real
      // step m→n is legal (isLegalStep prunes diagonals for non-Airborne sharks and everything else).
      for (const { x, y } of nearbySquaresW(state, n.x, n.y)) {
        const site = siteAt(state, x, y)
        if (!site || !isWaterSite(state, site, getCard)) continue
        for (const region of ['surface', 'underwater'] as Region[]) {
          const m = { x, y, region }
          if (K(m) === K(n) || dist.has(K(m))) continue
          if (!isLegalStep(state, shark, m, n)) continue
          dist.set(K(m), d)
          next.push(m)
        }
      }
    }
    frontier = next
  }
  return dist
}

function stepShark(ctx: EffectAPI, shark: UnitState, to: Node): void {
  const from = { x: shark.x, y: shark.y, region: shark.region }
  shark.x = to.x
  shark.y = to.y
  shark.region = to.region
  emitUnitMoved(ctx.state, shark, from) // a REAL move: it animates and fires departed-location triggers
}

function fight(ctx: EffectAPI, sharkId: string, preyId: string): void {
  const shark = ctx.state.units[sharkId]
  const prey = ctx.state.units[preyId]
  if (!shark || !prey) return
  pushLog(ctx.state, ctx.controller, `The Giant Shark smells blood — it attacks ${prey.name}!`)
  fightUnits(ctx.state, shark, prey) // a real fight: both strike (fires Interrogator, Lethal, kill triggers…)
}

// Every DISTINCT shortest route (full step list) from `start` to `goal`, following only steps that shorten
// the remaining distance. Capped so a wide-open sea can't blow up the option list.
function shortestRoutes(state: GameState, shark: UnitState, start: Node, goal: Node, dist: Map<string, number>): Node[][] {
  const out: Node[][] = []
  const CAP = 24
  const dfs = (node: Node, path: Node[]): void => {
    if (out.length >= CAP) return
    if (K(node) === K(goal)) { out.push([...path]); return }
    const d = dist.get(K(node))!
    for (const n of waterSteps(state, shark, node)) {
      if (dist.get(K(n)) === d - 1) { path.push(n); dfs(n, path); path.pop() }
    }
  }
  dfs(start, [])
  return out
}

// Label a route by the sites it passes through (a surfacing/submerging step keeps the same square, so we
// collapse consecutive same-square nodes and just note the dive).
function routeLabel(i: number, route: Node[]): string {
  const parts: string[] = []
  let prev: Node | null = null
  for (const n of route) {
    if (prev && prev.x === n.x && prev.y === n.y) parts.push(n.region === 'underwater' ? '(dive)' : '(surface)')
    else parts.push(squareLabel(n.x, n.y))
    prev = n
  }
  return `${i + 1}. ${parts.join(' → ')}`
}

// Walk the chosen route to the end, then fight. Per the FAQ the whole path is fixed up front and put on the
// Storyline: the Shark follows it even through a Silence aura, without re-planning.
function runRoute(ctx: EffectAPI, sharkId: string, preyId: string, route: Node[]): void {
  for (const step of route) {
    const shark = ctx.state.units[sharkId]
    if (!shark) return
    stepShark(ctx, shark, step)
  }
  fight(ctx, sharkId, preyId)
}

// Compute the shortest WATER route(s) to the prey, then move. No route → don't move or fight. Exactly one →
// take it. Several → ONE prompt for the whole movement, letting the controller pick a full route.
function chase(ctx: EffectAPI, sharkId: string, preyId: string): void {
  const shark = ctx.state.units[sharkId]
  const prey = ctx.state.units[preyId]
  if (!shark || !prey) return
  if (shark.x === prey.x && shark.y === prey.y) return fight(ctx, sharkId, preyId)
  const goal: Node = { x: prey.x, y: prey.y, region: prey.region === 'underwater' ? 'underwater' : 'surface' }
  const dist = distToGoal(ctx.state, shark, goal)
  const start: Node = { x: shark.x, y: shark.y, region: shark.region }
  if (dist.get(K(start)) === undefined) return // Waterbound: no water path reaches the prey → don't move/fight
  const routes = shortestRoutes(ctx.state, shark, start, goal, dist)
  if (!routes.length) return
  if (routes.length === 1) return runRoute(ctx, sharkId, preyId, routes[0])
  ctx.ask(
    { kind: 'chooseOption', title: `Giant Shark — choose its route to ${prey.name}.`, data: { options: routes.map((r, i) => routeLabel(i, r)) } },
    'sharkRoute',
    { sharkId, preyId, routes },
  )
}

registerScript('Giant Shark', {
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || moved.id === self.id) return // never reacts to its own entry/moves
    // FAQ: a unit merely changing REGION within the SAME site (surface↔underwater) is not "entering or
    // moving between sites" — the Shark does not react to it.
    if (from && from.x === moved.x && from.y === moved.y) return
    const body = bodyOfWaterAt(ctx.state, self.x, self.y)
    if (!body.has(`${moved.x},${moved.y}`)) return // the mover isn't in the Shark's body of water
    if (!ctx.state.units[moved.id]) return
    chase(ctx, self.id, moved.id)
  },
  conts: {
    sharkRoute: (ctx, c, choice) => {
      const routes = (c.routes as Node[][]) ?? []
      const options = routes.map((r, i) => routeLabel(i, r))
      const idx = typeof choice === 'number' ? choice : options.indexOf(String(choice))
      const route = routes[idx >= 0 ? idx : 0]
      if (route) runRoute(ctx, c.sharkId as string, c.preyId as string, route)
    },
  },
})
