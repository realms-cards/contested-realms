import { registerScript } from '../registry'
import { getKeywords } from '../../db'

// ------------------------------------------------------------- The Void ----
// 'This site is also void.'
registerScript('The Void', {
  siteAlsoVoid: true,
  // voidwalkers may be summoned to any void — this site included
  siteAllowsAnySummon: (_state, _site, _player, cardName) => !!getKeywords(cardName).voidwalk,
})
