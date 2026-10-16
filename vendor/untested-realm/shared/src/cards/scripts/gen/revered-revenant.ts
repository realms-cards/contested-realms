import { registerScript } from '../registry'
import { getCard } from '../../db'
import { adjacentSquaresW } from '../../../engine/grid'

// 'Has 0 power unless adjacent to an allied Ward.'
// Rulebook: "Adjacent refers to the card's OWN square AND the squares it shares a border with" — so an
// allied Ward on the Revenant's own square counts (a co-located warded ally, or the warded SITE it
// stands on). An "allied Ward" can be a warded unit OR a warded site.
registerScript('Revered Revenant', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    const adj = adjacentSquaresW(state, self.x, self.y) // includes the Revenant's own square
    const onAdj = (x: number, y: number) => adj.some((s) => s.x === x && s.y === y)
    const warded =
      Object.values(state.units).some(
        // adjacent allied warded unit — region-locked to the Revenant (a buried ward doesn't help a surface Revenant)
        (u) => u.controller === self.controller && u.ward && u.region === self.region && onAdj(u.x, u.y),
      ) ||
      Object.values(state.sites).some(
        // or an adjacent allied warded SITE (incl. the one it stands on)
        (s) => s.controller === self.controller && s.ward && onAdj(s.x, s.y),
      )
    return warded ? 0 : -(getCard(self.name).attack ?? 0)
  },
})
