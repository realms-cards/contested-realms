import { pushLog, registerCont, pushPrompt, siteCantBeMoved } from '../../../engine/effects'
import { enterSite } from '../../../engine/casting'
import { siteAt, GRID_W, GRID_H } from '../../../engine/grid'
import { moveSitesWithContents } from './move-sites'
import { strandedSites } from '../../../engine/statics'
import type { GameState, PlayerId } from '../../../engine/types'

// 'You may pull apart a partial row or column to make a void in which to play this.'
export type Shift = { axis: 'row' | 'col'; dir: 1 | -1; cells: { x: number; y: number }[]; label: string }

/** feasible pulls that vacate (x,y): the sub-run from (x,y) to the run's end
 *  slides one square outward into empty space, while the site on the other side of the seam stays.
 *  FAQ: "Choose a row or column with two adjacent sites and at least one void. … one site stays in its
 *  current square, and the other site (along with all other contiguous sites in its row or column)
 *  shifts one square." A lone site can't be pulled apart ("No. That's not what 'pull apart' means."),
 *  and a site that can't be moved (Bedrock, Bluecap Knockers) blocks the pull. */
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
      // the site behind the seam stays: it must exist (two adjacent sites are pulled apart)
      const behind = coord - dir
      if (behind < 0 || behind >= max || !siteAt(state, cellAt(behind).x, cellAt(behind).y)) continue
      const end = dir === 1 ? runEnd : runStart
      const beyond = end + dir
      if (beyond < 0 || beyond >= max) continue
      if (siteAt(state, cellAt(beyond).x, cellAt(beyond).y)) continue
      const cells: { x: number; y: number }[] = []
      for (let c = coord; dir === 1 ? c <= end : c >= end; c += dir) cells.push(cellAt(c))
      if (cells.some((cl) => { const st = siteAt(state, cl.x, cl.y); return !!st && siteCantBeMoved(state, st) })) continue
      // the seam is filled (the new site, or the Lavamancer's Rubble): no Edge of the World may lose its void
      const moved = new Map(cells.map((cl) => [siteAt(state, cl.x, cl.y)!.id, axis === 'row' ? { x: cl.x + dir, y: cl.y } : { x: cl.x, y: cl.y + dir }]))
      if (strandedSites(state, moved, [cellAt(coord)]).length) continue
      out.push({
        axis, dir, cells,
        label: axis === 'row' ? (dir === 1 ? 'push the row east' : 'push the row west') : dir === 1 ? 'push the column north' : 'push the column south',
      })
    }
  }
  return out
}

/** slide the shift's partial row/column one square outward, contents and all, vacating its first cell
 *  (Rift Valley plays into it; the Lavamancer fills it with Rubble) */
export function pullApart(state: GameState, player: PlayerId, shift: Shift): void {
  const dx = shift.axis === 'row' ? shift.dir : 0
  const dy = shift.axis === 'col' ? shift.dir : 0
  moveSitesWithContents(state, player, shift.cells.map((c) => ({ from: c, to: { x: c.x + dx, y: c.y + dy } })))
}

export function riftApply(state: GameState, player: PlayerId, cardId: string, x: number, y: number, shift: Shift): void {
  pullApart(state, player, shift)
  pushLog(state, player, `🌋 The land itself is pulled apart — a rift opens at (${x + 1},${y + 1})!`)
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
