import { registerScript } from '../registry'

// Scoria: 'Your (E) and (F) are equal to the highest of the two.'
// Tundra: 'Your (A) and (W) are equal to the highest of the two.'
// (statics.affinity equalizes the pair after every other source of threshold.)
registerScript('Scoria', { equalizesThresholds: ['earth', 'fire'] })
registerScript('Tundra', { equalizesThresholds: ['air', 'water'] })
