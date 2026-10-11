import { registerScript } from '../registry'
import { boneRaiseCemeteryAbility, BONE_RAISERS } from '../multi-card-utils/bone-raisers'

// '(4), Sacrifice a Skeleton token → Summon Zombie Bruiser from your cemetery
//  there.' (from-cemetery ability shared with the other bone-raisers — see m39)
registerScript('Zombie Bruiser', { cemeteryAbilities: boneRaiseCemeteryAbility(BONE_RAISERS['Zombie Bruiser']) })
