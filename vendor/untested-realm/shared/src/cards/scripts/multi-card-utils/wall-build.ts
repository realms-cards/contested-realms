import { type EffectAPI } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'
import { inBounds, siteAt, squareLabel, edgesConnected, GRID_W, GRID_H } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

/** cast-time placement rule: walls go on the border of a site you control */
export function wallPlacement(state: GameState, player: number, at: { x: number; y: number }): string | null {
  const site = siteAt(state, at.x, at.y)
  if (!site || site.controller !== player) return 'Walls are conjured atop the border of a site you control.'
  return null
}

/** shared genesis: pick which border of the site under `at` the wall occupies.
 *  Placement was validated at cast time; the fizzle below only fires if the
 *  site vanished mid-resolution. */
export function wallGenesis(wallName: string) {
  return (ctx: EffectAPI) => {
    const aura = ctx.state.auras[ctx.sourceId]
    const at = ctx.at
    if (!aura || !at) return dispel(ctx)
    const site = siteAt(ctx.state, at.x, at.y)
    if (!site || site.controller !== ctx.controller) {
      pushLog(ctx.state, ctx.controller, `The ground for ${wallName} is gone - it collapses.`)
      return dispel(ctx)
    }
    aura.squares = [{ x: at.x, y: at.y }]
    // a side is offered when its neighbour is a real square. With a Magellan Globe the seam-border
    // neighbour wraps to the far edge (a real square), so an edge site can raise a wall on its outer
    // border; without a Globe that side is off-board and dropped — walls span the seam only under it.
    const sides = (['north', 'east', 'south', 'west'] as const).filter((s) => {
      const n = neighbor(ctx.state, at, s)
      return inBounds(n.x, n.y)
    })
    // the client places walls by clicking an edge (a site intersection) and passes the
    // chosen border as extra.wallSide — resolve it directly, no extra prompt needed
    const pre = ctx.extra?.wallSide
    if (typeof pre === 'string' && (sides as readonly string[]).includes(pre)) {
      return raiseCont(ctx, { x: at.x, y: at.y }, pre)
    }
    ctx.ask({ kind: 'chooseOption', title: `${wallName}: which border of ${squareLabel(at.x, at.y)}?`, data: { options: [...sides] } }, 'raise', { x: at.x, y: at.y })
  }
}

function neighbor(state: GameState, at: { x: number; y: number }, side: string): { x: number; y: number } {
  const raw = side === 'north' ? { x: at.x, y: at.y + 1 }
    : side === 'south' ? { x: at.x, y: at.y - 1 }
    : side === 'east' ? { x: at.x + 1, y: at.y }
    : { x: at.x - 1, y: at.y }
  // the seam border only exists with a Magellan Globe: wrap the off-board neighbour to the far edge
  if (edgesConnected(state)) return { x: ((raw.x % GRID_W) + GRID_W) % GRID_W, y: ((raw.y % GRID_H) + GRID_H) % GRID_H }
  return raw
}

export function raiseCont(ctx: EffectAPI, c: any, choice: unknown): void {
  const aura = ctx.state.auras[ctx.sourceId]
  if (!aura || typeof choice !== 'string') return dispel(ctx)
  const a = { x: c.x as number, y: c.y as number }
  const b = neighbor(ctx.state, a, choice)
  if (!inBounds(b.x, b.y)) return dispel(ctx)
  aura.edge = { a, b }
  aura.squares = [a, b] // a wall is a 2x1 aura: it spans the border between BOTH squares
  pushLog(ctx.state, ctx.controller, `${aura.name} rises between ${squareLabel(a.x, a.y)} and ${squareLabel(b.x, b.y)}.`)
}

function dispel(ctx: EffectAPI): void {
  const aura = ctx.state.auras[ctx.sourceId]
  if (!aura) return
  const card = ctx.state.cards[aura.cardId]
  if (card) toCemetery(ctx.state, card.id)
  delete ctx.state.auras[ctx.sourceId]
}
