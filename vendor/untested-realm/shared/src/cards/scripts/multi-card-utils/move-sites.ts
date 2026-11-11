import type { GameState, PlayerId } from '../../../engine/types'
import { siteAt, occupiedSquares } from '../../../engine/grid'
import { notifySiteInterference } from '../../../engine/effects'
import { strandedSites } from '../../../engine/statics'
import { syncCarried } from '../../../engine/carrying'
import { getScript } from '../registry'

/** Everything that travels with the site at one square when the land itself moves (Earthquake, Rift
 *  Valley, Lavamancer, Polar Shift): the site, its normal-size units (every region), the artifacts lying
 *  there, and a single-site aura atop it. An oversized unit spans several sites and stays put (FAQ). */
export interface SquareCapture {
  x: number
  y: number
  site: ReturnType<typeof siteAt>
  units: GameState['units'][string][]
  arts: GameState['artifacts'][string][]
  auras: GameState['auras'][string][]
}

export function captureSquare(state: GameState, sq: { x: number; y: number }): SquareCapture {
  return {
    x: sq.x,
    y: sq.y,
    site: siteAt(state, sq.x, sq.y),
    units: Object.values(state.units).filter((u) => u.x === sq.x && u.y === sq.y && u.region !== 'void' && occupiedSquares(u).length === 1),
    arts: Object.values(state.artifacts).filter((a) => !a.carriedBy && a.x === sq.x && a.y === sq.y),
    auras: Object.values(state.auras).filter((r) => getScript(r.name)?.singleSiteAura && r.squares.length === 1 && r.squares[0].x === sq.x && r.squares[0].y === sq.y),
  }
}

/** put a captured square's contents down at `to` (the carried artifacts follow their bearers) */
export function placeCapture(state: GameState, cap: SquareCapture, to: { x: number; y: number }): void {
  if (cap.site) { cap.site.x = to.x; cap.site.y = to.y }
  for (const u of cap.units) { u.x = to.x; u.y = to.y }
  for (const u of cap.units) syncCarried(state, u)
  for (const a of cap.arts) { a.x = to.x; a.y = to.y }
  for (const r of cap.auras) r.squares = [{ x: to.x, y: to.y }]
}

/** Move the sites at every `from` square, with their contents, to their `to` squares simultaneously:
 *  everything is captured by its ORIGINAL square first, so a site may move onto a square another one is
 *  leaving. Callers make sure no two sites land on one square. Fires the "a site moved" interference
 *  (Vindictive Nation) for every site that moved. `illegal`, checked once everything has landed, undoes
 *  the whole move when it returns true; so does a move that strands a site that must always be adjacent
 *  to the void (Edge of the World). Returns whether it happened. */
export function moveSitesWithContents(
  state: GameState,
  player: PlayerId,
  moves: { from: { x: number; y: number }; to: { x: number; y: number } }[],
  illegal?: () => boolean,
): boolean {
  const caps = moves.map((m) => captureSquare(state, m.from))
  caps.forEach((cap, i) => placeCapture(state, cap, moves[i].to))
  if (illegal?.() || strandedSites(state).length > 0) {
    for (const cap of caps) placeCapture(state, cap, cap)
    return false
  }
  for (const cap of caps) {
    if (cap.site && (cap.site.x !== cap.x || cap.site.y !== cap.y)) {
      notifySiteInterference(state, 'move', { id: cap.site.id, x: cap.x, y: cap.y, controller: cap.site.controller }, player)
    }
  }
  return true
}
