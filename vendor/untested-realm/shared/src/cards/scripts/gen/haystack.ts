import { registerScript } from '../registry'

// ----------------------------------------------------------------- Haystack ----
// 'If an opponent would search a deck, they search the top three cards instead.'
registerScript('Haystack', { limitsEnemySearches: 3 })
