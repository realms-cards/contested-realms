import { registerScript } from '../registry'

// 'Non-fire Spellcaster' (the artifact makes its bearer one)
registerScript('Wicker Manikin', {
  selfKeywords: () => [{ spellcasterExclude: 'fire' }], // the manikin IS the caster
})
