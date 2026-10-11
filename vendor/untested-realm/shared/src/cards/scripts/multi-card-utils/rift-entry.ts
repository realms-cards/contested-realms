import { pushLog, registerCont, pushPrompt, notifySiteInterference } from '../../../engine/effects'
import { enterSite } from '../../../engine/casting'
import { siteAt, occupiedSquares, GRID_W, GRID_H } from '../../../engine/grid'
import type { GameState, PlayerId } from '../../../engine/types'

// 'You may pull apart a partial row or column to make a void in which to play this.'
type Shift = { axis: 'row' | 'col'; dir: 1 | -1; cells: { x: number; y: number }[]; label: string }

/** feasible pulls that vacate (x,y): the sub-run from (x,y) to the run's end
 *  slides one square outward into empty space */
export function riftShifts(state: GameState, x: number, y: number): Shift[] {
  if (!siteAt(state, x, y)) return []
  const out: Shift[] = []
  for (const axis of ['row', 'col'] as const) {
    const max = axis === 'row' ? GRID_W : GRID_H
    const coord = axis === 'row' ? x : y
    const cellAt = (c: number) => (axis === 'row' ? { x: c, y } : { x, y: c })
    // full run containing the seam must be partial (not spanning the whole line)
    let runStart = coord
    while (runStart - 1 >= 0 && siteAt(state, cellAt(runStart - 1).x, cellAt(runStart - 1).y)) runStart--
    let runEnd = coord
    while (runEnd + 1 < max && siteAt(state, cellAt(runEnd + 1).x, cellAt(runEnd + 1).y)) runEnd++
    if (runEnd - runStart + 1 >= max) continue
    for (const dir of [1, -1] as const) {
      // 'pull apart' needs TWO adjacent sites: one stays behind at the seam
      if (dir === 1 && coord <= runStart) continue
      if (dir === -1 && coord >= runEnd) continue
      const end = dir === 1 ? runEnd : runStart
      const beyond = end + dir
      if (beyond < 0 || beyond >= max) continue
      if (siteAt(state, cellAt(beyond).x, cellAt(beyond).y)) continue
      const cells: { x: number; y: number }[] = []
      for (let c = coord; dir === 1 ? c <= end : c >= end; c += dir) cells.push(cellAt(c))
      out.push({
        axis, dir, cells,
        label: axis === 'row' ? (dir === 1 ? 'push the row east' : 'push the row west') : dir === 1 ? 'push the column north' : 'push the column south',
      })
    }
  }
  return out
}

export function riftApply(state: GameState, player: PlayerId, cardId: string, x: number, y: number, shift: Shift): void {
  const dx = shift.axis === 'row' ? shift.dir : 0
  const dy = shift.axis === 'col' ? shift.dir : 0
  // slide from the far end inward so nothing lands on an occupied square
  const shifted: { id: string; x: number; y: number; controller: PlayerId | null }[] = []
  for (const cell of [...shift.cells].reverse()) {
    const site = siteAt(state, cell.x, cell.y)
    if (site) {
      shifted.push({ id: site.id, x: site.x, y: site.y, controller: site.controller })
      site.x += dx
      site.y += dy
    }
    for (const u of Object.values(state.units)) {
      if (occupiedSquares(u).length !== 1) continue // oversized stay put (FAQ)
      if (u.x === cell.x && u.y === cell.y && u.region !== 'void') {
        u.x += dx
        u.y += dy
        for (const artId of u.carrying) {
          const art = state.artifacts[artId]
          if (art) {
            art.x = u.x
            art.y = u.y
          }
        }
      }
    }
    for (const art of Object.values(state.artifacts)) {
      if (!art.carriedBy && art.x === cell.x && art.y === cell.y) {
        art.x += dx
        art.y += dy
      }
    }
  }
  pushLog(state, player, `🌋 The land itself is pulled apart — a rift opens at (${x + 1},${y + 1})!`)
  for (const pre of shifted) notifySiteInterference(state, 'move', pre, player)
  // the vacated square now hosts the incoming site. Route it through the canonical entry so it gets
  // its mana, Ward, GENESIS, and the onSitePlayed event exactly like a normal play — this is what
  // lets Mirror Realm copy Rift Valley "the special way" (its genesis reflects once it has landed).
  // The site's name is the card's own: Rift Valley, or "Mirror Realm" until it reflects.
  const p = state.players[player]
  p.hand.splice(p.hand.indexOf(cardId), 1)
  pushLog(state, player, `${p.name} plays ${state.cards[cardId].name} at (${x + 1},${y + 1}).`)
  enterSite(state, player, cardId, x, y)
}

/** The scripted "pull apart the land and play into the void" entry, shared by Rift Valley and by
 *  Mirror Realm when it reflects a Rift Valley. Resolves the shift (prompting when more than one
 *  direction is possible), then places the card at (x,y) via riftApply → enterSite. */
export function riftEntry(state: GameState, player: PlayerId, cardId: string, x: number, y: number): string | null {
  const shifts = riftShifts(state, x, y)
  if (!shifts.length) return 'No way to pull the land apart there.'
  if (shifts.length === 1) {
    riftApply(state, player, cardId, x, y, shifts[0])
    return null
  }
  pushPrompt(state, {
    player,
    kind: 'chooseOption',
    title: 'Pull the land apart in which direction?',
    data: { options: shifts.map((s) => s.label) },
    cont: 'rift:dir',
    ctx: { cardId, x, y, player },
  })
  return null
}

registerCont('rift:dir', (state, c: { cardId: string; x: number; y: number; player: PlayerId }, choice) => {
  const p = state.players[c.player]
  if (!p.hand.includes(c.cardId)) return
  const shifts = riftShifts(state, c.x, c.y)
  const shift = shifts.find((s) => s.label === choice)
  if (!shift) return
  riftApply(state, c.player, c.cardId, c.x, c.y, shift)
})
