import { registerScript } from '../registry'

// 'Bearer has +1 power and is an Air Spellcaster.'
registerScript('Sensu of the Fang', {
  bearerKeywords: ['air spellcaster'],
  artifactGrantsPower: (state, artifactId, unit) => (state.artifacts[artifactId]?.carriedBy === unit.id ? 1 : 0),
})
