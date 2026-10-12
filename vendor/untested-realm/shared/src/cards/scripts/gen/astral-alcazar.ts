import { registerScript } from '../registry'
import { GRID_H, GRID_W, siteAt } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'

// 'Units can move between this site and any void as if they were adjacent.'
registerScript('Astral Alcazar', {
  extraSteps: (state, unit, from, selfId) => {
    const alcazar = state.sites[selfId] // THIS Alcazar, so two of them each open their own void link
    if (!alcazar) return []
    const kw = effKeywords(state, unit)
    const out = []
    // standing on the Alcazar → step to any void (needs Voidwalk to survive there)
    if (from.x === alcazar.x && from.y === alcazar.y && from.region === 'surface' && kw.voidwalk) {
      for (let x = 0; x < GRID_W; x++) {
        for (let y = 0; y < GRID_H; y++) {
          if (!siteAt(state, x, y)) out.push({ x, y, region: 'void' as const })
        }
      }
    }
    // in any void → step onto the Alcazar
    if (from.region === 'void') out.push({ x: alcazar.x, y: alcazar.y, region: 'surface' as const })
    return out
  },
})
