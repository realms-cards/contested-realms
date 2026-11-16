import { registerScript } from '../registry'
import { GRID_H, GRID_W, edgesConnected, inBounds, realmIsFlat } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'
import type { Step } from '../../../engine/types'
import { wrapStepsTo } from '../multi-card-utils/wrap-step'

// 'Airborne, Submerge / Can move as if the opposite edges of the realm were connected.'
// Both pairs of edges (top–bottom AND left–right): for its own steps the squares across an edge are
// adjacent (Codex, As If Connected — only for movement, and never for forced movement). Airborne, it may
// also step diagonally across an edge or corner, atop sites. Nothing extra while a Magellan Globe already
// connects the edges (those steps are normal adjacency then) or while the realm is flat.
registerScript('Jussi Puffins', {
  extraSteps: (state, unit, from) => {
    if (edgesConnected(state) || realmIsFlat(state)) return []
    const kw = effKeywords(state, unit)
    const out: Step[] = []
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    if (kw.airborne && from.region === 'surface') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1])
    for (const [dx, dy] of dirs) {
      if (inBounds(from.x + dx, from.y + dy)) continue // an ordinary step, not across an edge
      const wx = (from.x + dx + GRID_W) % GRID_W
      const wy = (from.y + dy + GRID_H) % GRID_H
      if (wx === from.x && wy === from.y) continue
      for (const s of wrapStepsTo(state, unit, from, wx, wy, kw)) {
        // a diagonal flight stays atop sites
        if (dx !== 0 && dy !== 0 && s.region !== 'surface') continue
        if (!out.some((o) => o.x === s.x && o.y === s.y && o.region === s.region)) out.push(s)
      }
    }
    return out
  },
})
