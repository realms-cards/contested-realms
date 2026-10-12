import { registerScript } from '../registry'

// 'Immediately heals from damage that doesn't kill it.'
// The heal is resolved centrally in checkStateBased AFTER the lethal-damage check (not per-hit in
// onSelfDamaged, which fired BEFORE lethality was judged and made a single 6-damage blow or two
// simultaneous Bosk Trolls survive). See engine/effects.ts healsNonlethalDamage.
registerScript('Seirawan Hydra', {
  healsNonlethalDamage: true,
})
