import { registerScript } from '../registry'
import { BONE_RAISERS, boneRaiseCemeteryAbility } from '../multi-card-utils/bone-raisers'

registerScript('Fowl Bones', { cemeteryAbilities: boneRaiseCemeteryAbility(BONE_RAISERS['Fowl Bones']) })
