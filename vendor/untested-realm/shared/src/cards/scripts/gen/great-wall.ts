import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'
import { edgesConnected, GRID_H } from '../../../engine/grid'

// "Enemy units can't move through this site's top border on the ground."
// ("top border" = the border facing the controller's opponent)
registerScript('Great Wall', {
  entryFilter: (state, selfId, unit, from, to) => {
    const site = state.sites[selfId]
    if (!site || site.controller === null || unit.controller === site.controller) return true
    if (from.region !== 'surface' || to.region !== 'surface') return true
    if (effKeywords(state, unit).airborne) return true // airborne flies over — not "on the ground"
    let frontY = site.controller === 0 ? site.y + 1 : site.y - 1
    // a wall may sit on the world border under a Magellan Globe, so its "top border" wraps to the far edge
    if (edgesConnected(state)) frontY = ((frontY % GRID_H) + GRID_H) % GRID_H
    // crossing between the wall's square and the square in front of it
    const crossing =
      (from.x === site.x && from.y === frontY && to.x === site.x && to.y === site.y) ||
      (from.x === site.x && from.y === site.y && to.x === site.x && to.y === frontY)
    return !crossing
  },
})
