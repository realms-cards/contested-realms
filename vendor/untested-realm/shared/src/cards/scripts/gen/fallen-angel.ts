import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'Airborne / Nearby allied Demons have +1 power.'
// "Nearby allied Demons" (NOT "other") — the Demon gate does the work: a base Fallen Angel is an Angel, so
// it doesn't buff itself, but if it BECOMES a Demon (a Corruptor makes your Angels Demons) it's a nearby
// allied Demon and buffs itself too. An allied Demon AVATAR (Mephistopheles) is included likewise.
registerScript('Fallen Angel', {
  grantsPower: (state, self, other) => {
    if (other.controller !== self.controller) return 0
    if (!hasSubtype(state, other, 'Demon')) return 0
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y) ? 1 : 0
  },
})
