import { registerScript } from '../registry'

// 'You have no atlas, but your spellbook may contain sites, and you start with
//  seven cards. / Tap → Play a site.'
registerScript('Magician', {
  sitesInSpellbook: true,
  noAtlasDraw: true,
  setupDraw: { spells: 7, sites: 0 },
})
