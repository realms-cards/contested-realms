import { registerScript } from '../registry'
import { surfaceAndRaiseSkeletons } from '../multi-card-utils/surface-and-raise-skeletons'

// 'Surface everything at target water site and summon two Skeleton tokens there.'
registerScript('Dredge', surfaceAndRaiseSkeletons('water'))
