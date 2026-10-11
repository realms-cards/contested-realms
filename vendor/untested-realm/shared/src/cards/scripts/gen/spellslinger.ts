import { registerScript } from '../registry'

// 'Start the game with 4 spells in hand.'
registerScript('Spellslinger', {
  setupDraw: { spells: 4 },
})
