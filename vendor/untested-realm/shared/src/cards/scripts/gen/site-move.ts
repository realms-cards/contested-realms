// Shared site-relocation helpers used by Earthquake, Baba Yaga's Hut, Atlas Wanderers and Cloud City
// (moving/swapping whole sites and carrying their normal-size contents). Formerly lived in the m22 module.
import type { GameState, PlayerId } from '../../../engine/types'
import { pushLog, notifySiteInterference, siteCantBeMoved } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { getScript } from '../registry'

/** move everything of normal size at (from) — units in every region, loose artifacts, and any
 *  single-site (1x1) aura sitting atop the site (Wildfire, Castle's/Hamlet's Ablaze!) — to (to) */
export function carryContents(state: GameState, from: { x: number; y: number }, to: { x: number; y: number }): void {
  for (const u of Object.values(state.units)) {
    if (u.x === from.x && u.y === from.y && !(getScript(u.name)?.oversized && !u.silenced)) {
      u.x = to.x
      u.y = to.y
    }
  }
  for (const a of Object.values(state.artifacts)) {
    if (!a.carriedBy && a.x === from.x && a.y === from.y) {
      a.x = to.x
      a.y = to.y
    }
  }
  // a 1x1 aura is conjured ATOP a site, so it rides along when that site is moved
  for (const r of Object.values(state.auras)) {
    if (getScript(r.name)?.singleSiteAura && r.squares.length === 1 && r.squares[0].x === from.x && r.squares[0].y === from.y) {
      r.squares = [{ x: to.x, y: to.y }]
    }
  }
}

/** swap two sites (or a site and a void), each carrying its normal-size contents */
export function swapSquares(state: GameState, a: { x: number; y: number }, b: { x: number; y: number }, by?: PlayerId): boolean {
  const sa = siteAt(state, a.x, a.y)
  const sb = siteAt(state, b.x, b.y)
  // a site that can't be moved (Bedrock, Bluecap Knockers' site) blocks the whole swap
  const stuck = (sa && siteCantBeMoved(state, sa) && sa) || (sb && siteCantBeMoved(state, sb) && sb)
  if (stuck) {
    pushLog(state, by ?? null, `${stuck.name} can't be moved.`)
    return false
  }
  // Vindictive Nation judges moves by PRE-move adjacency (FAQ)
  const preA = sa ? { id: sa.id, x: sa.x, y: sa.y, controller: sa.controller } : null
  const preB = sb ? { id: sb.id, x: sb.x, y: sb.y, controller: sb.controller } : null
  // stash A's content coords out of the way, move B's to A, then A's to B
  const movedFromA = Object.values(state.units).filter(
    (u) => u.x === a.x && u.y === a.y && !(getScript(u.name)?.oversized && !u.silenced),
  )
  const artsFromA = Object.values(state.artifacts).filter((x) => !x.carriedBy && x.x === a.x && x.y === a.y)
  const aurasFromA = Object.values(state.auras).filter(
    (r) => getScript(r.name)?.singleSiteAura && r.squares.length === 1 && r.squares[0].x === a.x && r.squares[0].y === a.y,
  )
  carryContents(state, b, a) // moves B's units / artifacts / 1x1 auras to A
  for (const u of movedFromA) {
    u.x = b.x
    u.y = b.y
  }
  for (const art of artsFromA) {
    art.x = b.x
    art.y = b.y
  }
  for (const r of aurasFromA) {
    r.squares = [{ x: b.x, y: b.y }]
  }
  if (sa) {
    sa.x = b.x
    sa.y = b.y
  }
  if (sb) {
    sb.x = a.x
    sb.y = a.y
  }
  // moved sites get announced with their PRE-move positions (Vindictive Nation)
  if (preA) notifySiteInterference(state, 'move', preA, by ?? null)
  if (preB) notifySiteInterference(state, 'move', preB, by ?? null)
  return true
}
