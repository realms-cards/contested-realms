import { registerScript } from '../registry'

// 'Bearer has Ranged and can see stealthed enemies.'
registerScript('Truesight Crossbow', {
  bearerKeywords: [{ ranged: 1 }],
  bearerTruesight: true,
})
