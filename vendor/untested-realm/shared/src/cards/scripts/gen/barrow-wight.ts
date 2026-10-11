import { registerScript } from '../registry'
import { BONE_RAISERS, boneRaiseCemeteryAbility } from '../multi-card-utils/bone-raisers'

registerScript('Barrow Wight', { cemeteryAbilities: boneRaiseCemeteryAbility(BONE_RAISERS['Barrow Wight']) })
