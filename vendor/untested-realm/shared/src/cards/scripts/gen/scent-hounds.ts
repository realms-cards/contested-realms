import { registerScript } from '../registry'

// ---- stealth-strip retrofits (A/B cards waiting on the hook) ----
// 'Nearby enemies permanently lose Stealth.'
registerScript('Scent Hounds', { stripStealth: 'nearby' })
