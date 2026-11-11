import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import type { Region } from '../../../engine/types'

// 'Stealth / Can and must be cast to any location without allies nearby.'
// Any location — atop anyone's site — as long as no unit you control (your Avatar included) is nearby it
// in that region; never one with an ally nearby, even your own site.
registerScript('Lone Wolf', {
  summonAnywhere: true,
  summonFilter: (state, player, at) => {
    const region = ((at as { region?: Region }).region ?? 'surface') as Region
    const crowded = nearbySquaresW(state, at.x, at.y).some((sq) => unitsAt(state, sq.x, sq.y, region).some((u) => u.controller === player))
    return crowded ? 'Lone Wolf must be cast where no ally is nearby.' : null
  },
})
