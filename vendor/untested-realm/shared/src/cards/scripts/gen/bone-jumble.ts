import { registerScript } from '../registry'
import { BONE_RAISERS, boneRaiseCemeteryAbility, sacrificeSkeletonAndRaise } from '../multi-card-utils/bone-raisers'

// The bone-raiser cards: their raise now lives on the card as a cemetery ability (Bone Jumble owns
// the shared `boneRaisePick` cont for all of them). Keywords (Charge / Burrowing / Airborne) are printed.
registerScript('Bone Jumble', {
  cemeteryAbilities: boneRaiseCemeteryAbility(BONE_RAISERS['Bone Jumble']),
  conts: {
    boneRaisePick: (ctx, c, choice) => {
      const skId = Array.isArray(choice) ? (choice[0] as string) : (choice as string)
      if (skId) sacrificeSkeletonAndRaise(ctx.state, ctx.controller, c.cardId as string, skId)
    },
  },
})
