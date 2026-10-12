import { registerScript } from '../registry'
import { isKnightSirDame } from '../multi-card-utils/knightly'

// 'Anyone may cast Knights, Sirs, or Dames to this site and may do so for no threshold.'
registerScript('Tournament Grounds', {
  siteAllowsAnySummon: (_state, _site, _player, cardName) => isKnightSirDame(cardName),
  knightsNeedNoThresholdHere: true,
})
