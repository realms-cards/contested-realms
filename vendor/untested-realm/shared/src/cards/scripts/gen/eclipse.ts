import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { isEvilCardNameFor } from '../../../engine/statics'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'You may cast Evil minions to affected sites. / Evil allies occupying affected
//  sites have +1 power.'
registerScript('Eclipse', {
  // mirrors Crusade / Jihad: the permission is bound to the aura's own affected squares (you may
  // summon an Evil minion onto a covered site, even an enemy's — but not elsewhere). Uses the
  // canonical Evil arbiter (subtypes + Corruptor + saintWatches), matching auraGrantsPower below.
  auraAllowsSummon: (state, aura, player, cardName, at) =>
    aura.controller === player && isEvilCardNameFor(state, player, cardName) &&
    aura.squares.some((s) => s.x === at.x && s.y === at.y),
  auraGrantsPower: (state, aura, unit) => {
    // an Evil allied AVATAR (Mephistopheles, a branded/Corrupted avatar) is an Evil ally too → +1
    if (unit.controller !== aura.controller || unit.region !== 'surface') return 0
    if (!isEvilU(state, unit)) return 0
    return aura.squares.some((s) => s.x === unit.x && s.y === unit.y && siteAt(state, s.x, s.y)) ? 1 : 0
  },
})
