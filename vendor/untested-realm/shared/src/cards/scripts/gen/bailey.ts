import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'

// "Enemies can't move to here on the ground." (Bailey, an artifact)
// A forced PUSH/pull/drag is still ground movement (a step between surface sites — not Airborne, not
// teleportation), so an enemy can't be dragged onto Bailey either: the drag stops the step before it
// (Grapple Shot, Meat Hook…). A genuine TELEPORT isn't "on the ground", so it may still land here —
// hence entryFilterBlocksPush (blocks push, not teleport), the same flag Perilous Bridge uses.
registerScript('Bailey', {
  entryFilterBlocksPush: true,
  entryFilter: (state, selfId, unit, from, to) => {
    const art = state.artifacts[selfId]
    if (!art) return true
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    if (unit.controller === controller) return true
    if (to.x !== art.x || to.y !== art.y || to.region !== 'surface') return true
    if (effKeywords(state, unit).airborne) return true // airborne enemies fly in — not "on the ground"
    return from.region !== 'surface'
  },
})
