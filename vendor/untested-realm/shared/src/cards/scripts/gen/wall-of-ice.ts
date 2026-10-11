import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'
import { raiseCont, wallGenesis, wallPlacement } from '../multi-card-utils/wall-build'

// "Units can't traverse Wall of Ice on the ground."
registerScript('Wall of Ice', {
  auraPlacement: wallPlacement,
  edgeAura: true,
  genesis: wallGenesis('Wall of Ice'),
  conts: { raise: raiseCont },
  wallBlocks: (state, _aura, unit) => !effKeywords(state, unit).airborne,
})
