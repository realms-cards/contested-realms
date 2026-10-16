import { registerScript } from '../registry'
import { forcedSubsurface } from '../multi-card-utils/forced-subsurface'

// 'Submerge target minion or artifact, if able.'
registerScript('Drown', forcedSubsurface('water'))
