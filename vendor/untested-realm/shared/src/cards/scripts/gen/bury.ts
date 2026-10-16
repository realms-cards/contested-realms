import { registerScript } from '../registry'
import { forcedSubsurface } from '../multi-card-utils/forced-subsurface'

// 'Burrow target minion or artifact, if able.'
registerScript('Bury', forcedSubsurface('land'))
