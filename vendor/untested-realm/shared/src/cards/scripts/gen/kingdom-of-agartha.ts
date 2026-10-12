import { registerScript } from '../registry'
import { affinity } from '../../../engine/casting'

// '(E)(E)(E) — All minions have Burrowing.'
registerScript('Kingdom of Agartha', {
  // '(E)(E)(E) — All minions have Burrowing.' (gated on the controller's affinity)
  siteGrantsKeywords: (state, site, unit) => {
    if (unit.isAvatar || site.controller === null) return []
    return affinity(state, site.controller).earth >= 3 ? ['burrowing'] : []
  },
  // FAQ: with the gate met you may even SUMMON minions underground
  summonsGainKeywords: (state, siteId) => {
    const site = state.sites[siteId]
    if (!site || site.controller === null) return []
    return affinity(state, site.controller).earth >= 3 ? ['burrowing'] : []
  },
})
