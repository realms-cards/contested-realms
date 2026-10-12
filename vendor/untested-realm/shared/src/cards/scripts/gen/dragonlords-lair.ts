import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Dragons cast to this site require no threshold and cost (1) less.'
// (threshold part needs the threshold layer — cost part implemented; threshold
// waiver handled via thresholdWaiver hook below when available)
registerScript("Dragonlord's Lair", {
  costModifier: (state, sourceId, caster, cardName, at) => {
    const site = state.sites[sourceId]
    if (!site || !at || !(site.x === at.x && site.y === at.y)) return 0
    return getCard(cardName).subtypes.includes('Dragon') ? -1 : 0
  },
  // "Dragons cast to this site require no threshold" — a continuous waiver (not one-shot).
  siteGrantsNoThreshold: (state, site, cardId, at) => {
    if (at !== undefined && !(site.x === at.x && site.y === at.y)) return false
    const name = state.cards[cardId]?.name
    return !!name && getCard(name).subtypes.includes('Dragon')
  },
})
