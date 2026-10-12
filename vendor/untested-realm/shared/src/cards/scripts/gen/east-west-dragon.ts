import { registerScript } from '../registry'

// 'Airborne / Moves freely sideways.'
registerScript('East-West Dragon', {
  freeStep: (state, unit, from, to) => to.y === from.y && to.region === 'surface' && from.region === 'surface',
})
