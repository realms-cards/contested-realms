import { registerScript } from '../registry'
import { GRID_H, GRID_W, inBounds, realmIsFlat } from '../../../engine/grid'
import { effKeywords, terrainAt } from '../../../engine/statics'
import type { Region } from '../../../engine/types'
import { wrapStepsTo } from '../multi-card-utils/wrap-step'

// 'Opposite edges of the realm are connected.' (Magellan Globe — for everyone)
// A square across a joined edge is adjacent like any other, so every kind of step works across it: a
// surface step onto a site, a Voidwalk step into (or out of) the void, an underground/underwater step
// between subsurfaces. These grants skip isLegalStep's geometry, so each one is checked here.
registerScript('Magellan Globe', {
  extraSteps: (state, unit, from) => {
    const kw = effKeywords(state, unit)
    // Airborne units step diagonally (8 neighbours) on the surface, everything else orthogonally (4). A
    // neighbour that runs off the board wraps to the opposite edge — so an Airborne unit at a corner can
    // fly DIRECTLY to the opposite corner in one diagonal wrap step (FAQ 6).
    const air = !!kw.airborne && from.region === 'surface'
    const dirs = air
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const out: { x: number; y: number; region: Region }[] = []
    const seen = new Set<string>()
    for (const [dx, dy] of dirs) {
      const nx = from.x + dx
      const ny = from.y + dy
      if (inBounds(nx, ny)) continue // in-bounds steps are handled by normal adjacency
      const wx = ((nx % GRID_W) + GRID_W) % GRID_W
      const wy = ((ny % GRID_H) + GRID_H) % GRID_H
      const k = `${wx},${wy}`
      if (seen.has(k) || (wx === from.x && wy === from.y)) continue
      seen.add(k)
      const diagonal = dx !== 0 && dy !== 0
      if (diagonal) { if (terrainAt(state, wx, wy) !== 'void') out.push({ x: wx, y: wy, region: 'surface' }); continue } // Airborne flight stays on the surface
      out.push(...wrapStepsTo(state, unit, from, wx, wy, kw))
    }
    // a flat realm (Flat Realm Society) has no connected edges — checked only when there's a wrap to deny
    return out.length && realmIsFlat(state) ? [] : out
  },
})
