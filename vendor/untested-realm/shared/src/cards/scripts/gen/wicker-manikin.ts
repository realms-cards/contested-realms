import { registerScript } from '../registry'

// 'Non-fire Spellcaster' (the artifact makes its bearer one)
registerScript('Wicker Manikin', {
  selfKeywords: () => ['non-fire spellcaster'], // the manikin IS the caster
})
