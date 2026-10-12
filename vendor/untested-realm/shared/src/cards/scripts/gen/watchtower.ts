import { registerScript } from '../registry'

// 'Enemy units atop nearby sites permanently lose Stealth.'
registerScript('Watchtower', {
  stripStealth: 'nearby',
})
