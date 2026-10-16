import { registerScript } from '../registry'
import { isEvilCardNameFor } from '../../../engine/statics'
import { isEvilU } from '../multi-card-utils/is-evil-u'
import { summonPermissionAura } from '../multi-card-utils/summon-permission-aura'

// 'You may cast Evil minions to affected sites. / Evil allies occupying affected sites have +1 power.'
// Canonical Evil arbiter (subtypes + Corruptor + saintWatches). An Evil allied AVATAR (Mephistopheles,
// a branded/Corrupted avatar) counts for the bonus too — isEvilU includes avatars, so no isAvatar guard.
registerScript('Eclipse', summonPermissionAura({
  canSummon: (state, player, name) => isEvilCardNameFor(state, player, name),
  bonus: { applies: (state, u) => isEvilU(state, u) },
}))
