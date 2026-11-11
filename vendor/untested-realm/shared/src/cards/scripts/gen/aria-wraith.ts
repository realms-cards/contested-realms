import { registerScript } from '../registry'
import { destroyTogether } from '../multi-card-utils/destroy-together'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { isDisabled, isArtifactUnit } from '../../../engine/statics'
import { breakStealthAbility } from '../multi-card-utils/break-stealth'

// 'Stealth / Break Stealth → Destroy all artifacts and disabled minions nearby.'
// Nearby is region-locked to the Wraith. An Automaton is an artifact too (Codex), so it goes. Everything is chosen first, then destroyed together.
registerScript('Aria Wraith', {
  abilities: [breakStealthAbility('aria', 'destroy nearby artifacts and disabled minions', (ctx, self) => {
    const near = nearbySquaresW(ctx.state, self.x, self.y)
    const isNear = (o: { x: number; y: number }) => near.some((s) => s.x === o.x && s.y === o.y)
    const arts = Object.values(ctx.state.artifacts).filter((a) => a.region === self.region && isNear(a))
    const minions = near.flatMap((sq) => unitsAt(ctx.state, sq.x, sq.y, self.region)).filter((u) => !u.isAvatar && (isDisabled(ctx.state, u) || isArtifactUnit(ctx.state, u)))
    destroyTogether(ctx, minions.map((u) => u.id), arts.map((a) => a.id))
    ctx.log('The Wraith\'s aria shatters what can\'t hear it.')
  })],
})
