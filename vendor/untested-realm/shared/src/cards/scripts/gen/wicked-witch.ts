import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Spellcaster / Other nearby minions have -2 power.'
registerScript('Wicked Witch', {
  grantsPower: (state, self, other) => {
    // region-locked to the WITCH: she only curses minions in her OWN region (a burrowed/submerged one
    // is out of a surface witch's reach, and vice-versa). nearbySquaresW is Magellan-Globe aware.
    if (other.id === self.id || other.isAvatar || other.region !== self.region) return 0
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y) ? -2 : 0
  },
})
