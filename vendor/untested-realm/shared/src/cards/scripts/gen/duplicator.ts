import { registerScript } from '../registry'

// 'Your spellbook and atlas can only contain matching pairs of Uniques and you
//  start with only two spells and two sites in hand.'
registerScript('Duplicator', {
  pairsOfUniques: true,
  setupDraw: { spells: 2, sites: 2 },
})
