import { registerScript } from '../registry'
import { backRowOnly } from '../multi-card-utils/back-row-only'

// 'Only provides mana and threshold while in your back row.'
registerScript('Joyous Garde', backRowOnly)
