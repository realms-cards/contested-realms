import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'
import { edgesConnected, GRID_H } from '../../../engine/grid'

// "Units can't traverse this site's top border on the ground." (both players)
// FAQ: a non-Airborne unit can't be forced across the border by a PUSH/pull either (Grapple Shot,
// Pudge Butcher's hook), but a genuine TELEPORT may cross — so the filter blocks pushes but not
// teleports (entryFilterBlocksPush, honoured by ctx.teleport's push flag).
registerScript('Perilous Bridge', {
  entryFilterBlocksPush: true,
  entryFilter: (state, selfId, unit, from, to) => {
    const site = state.sites[selfId]
    if (!site || site.controller === null) return true
    if (from.region !== 'surface' || to.region !== 'surface') return true
    if (effKeywords(state, unit).airborne) return true // airborne flies over — not "on the ground"
    let frontY = site.controller === 0 ? site.y + 1 : site.y - 1
    if (edgesConnected(state)) frontY = ((frontY % GRID_H) + GRID_H) % GRID_H // wall may sit on the world border (Magellan)
    const crossing =
      (from.x === site.x && from.y === frontY && to.x === site.x && to.y === site.y) ||
      (from.x === site.x && from.y === site.y && to.x === site.x && to.y === frontY)
    return !crossing
  },
})
