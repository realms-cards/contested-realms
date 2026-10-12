import { registerScript } from '../registry'

// 'Players can't draw more than one spell each turn.'
registerScript('Garden of Eden', {
  limitSpellDraws: true,
})
