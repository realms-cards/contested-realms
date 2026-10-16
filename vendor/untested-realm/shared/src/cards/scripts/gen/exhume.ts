import { registerScript } from '../registry'
import { surfaceAndRaiseSkeletons } from '../multi-card-utils/surface-and-raise-skeletons'

// 'Unburrow everything at target land site and summon two Skeleton tokens there.'
registerScript('Exhume', surfaceAndRaiseSkeletons('land'))
