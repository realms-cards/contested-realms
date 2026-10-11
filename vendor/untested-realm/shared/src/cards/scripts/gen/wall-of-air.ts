import { registerScript } from '../registry'
import { effAttack, effKeywords } from '../../../engine/statics'
import { raiseCont, wallGenesis, wallPlacement } from '../multi-card-utils/wall-build'

// 'Minions with Airborne or 2 or less power can't traverse Wall of Air.'
registerScript('Wall of Air', {
  auraPlacement: wallPlacement,
  edgeAura: true,
  genesis: wallGenesis('Wall of Air'),
  conts: { raise: raiseCont },
  wallBlocks: (state, _aura, unit) => {
    if (unit.isAvatar) return false
    return !!effKeywords(state, unit).airborne || effAttack(state, unit) <= 2
  },
})
