import { registerScript } from '../registry'
import { GRID_H, GRID_W, inBounds, siteAt } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'

// 'Opposite edges of the realm are connected.' (Magellan Globe — for everyone)
registerScript('Magellan Globe', {
  extraSteps: (state, unit, from) => {
    if (from.region !== 'surface') return []
    // Airborne units step diagonally (8 neighbours), grounded units orthogonally (4). A neighbour
    // that runs off the board wraps to the opposite edge — so an Airborne unit at a corner can fly
    // DIRECTLY to the opposite corner in one diagonal wrap step (FAQ 6).
    const air = !!effKeywords(state, unit).airborne
    const dirs = air
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const out: { x: number; y: number; region: 'surface' }[] = []
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
      if (siteAt(state, wx, wy)) out.push({ x: wx, y: wy, region: 'surface' }) // a destination still needs a site
    }
    return out
  },
})
