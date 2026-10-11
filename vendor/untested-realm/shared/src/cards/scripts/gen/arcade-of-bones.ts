import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'While in this row, Undead move freely and can't be targeted or damaged by
// magic.' (magic-protection half; free movement stays in the backlog)
registerScript('Arcade of Bones', {
  magicProtected: (state, selfId, unit) => {
    const art = state.artifacts[selfId]
    if (!art || unit.isAvatar) return false
    return art.y === unit.y && hasSubtype(state, unit, 'Undead')
  },
  // "While in this row, Undead move freely." Every SITE in the Arcade's row acts like a bridge for
  // Undead — they slide ALONG the row (between row sites) at no step cost, exactly as the rulebook's
  // "moves freely" requires the step's START and END to both satisfy the condition ("in this row").
  // So the free step is confined to the Arcade's row (from.y === to.y === art.y), off a site in it;
  // LEAVING the row (a step to another row) is a normal paid step. This is a pure function of the
  // step (from→to), so the 0-1 BFS chains correctly along the row without the old origin guard, and
  // an Undead can't "glide freely" off-row (the earlier bug reached squares two rows away for free).
  artifactFreeStep: (state, selfId, unit, from, to) => {
    const art = state.artifacts[selfId]
    if (!art || unit.isAvatar) return false
    if (from.region !== 'surface' || to.region !== 'surface') return false
    if (from.y !== art.y || to.y !== art.y) return false // the step stays within the Arcade's row
    if (!siteAt(state, from.x, from.y)) return false // moving off a site in that row
    return hasSubtype(state, unit, 'Undead')
  },
})
