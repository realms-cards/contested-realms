import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'
import type { GameState } from '../../../engine/types'

// "Minions can't enter this span of land from the void."
registerScript('Endless Fence', {
  entryFilter: (state, selfId, unit, from, to) => {
    const site = state.sites[selfId]
    if (!site || unit.isAvatar) return true
    if (from.region !== 'void') return true
    // the fence protects its whole contiguous span of land
    const target = siteAt(state, to.x, to.y)
    if (!target || to.region === 'void') return true
    const span = spanOfLand(state, site.x, site.y)
    return !span.has(`${to.x},${to.y}`)
  },
})

function spanOfLand(state: GameState, x: number, y: number): Set<string> {
  const out = new Set<string>()
  const stack = [{ x, y }]
  while (stack.length) {
    const cur = stack.pop()!
    const key = `${cur.x},${cur.y}`
    if (out.has(key)) continue
    if (terrainAt(state, cur.x, cur.y) !== 'land') continue
    out.add(key)
    for (const s of adjacentSquaresW(state, cur.x, cur.y)) stack.push(s)
  }
  return out
}
