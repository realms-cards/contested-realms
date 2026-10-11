import { registerScript } from '../registry'

// 'Bearer has +2 power.'
registerScript('Sword and Shield', {
  artifactGrantsPower: (state, artifactId, unit) => (state.artifacts[artifactId]?.carriedBy === unit.id ? 2 : 0),
})
