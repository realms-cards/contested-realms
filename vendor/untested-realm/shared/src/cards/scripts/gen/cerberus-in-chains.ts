import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effKeywords } from '../../../engine/statics'
import { stepDistanceW } from '../../../engine/movement'
import type { GameState, Step, UnitState } from '../../../engine/types'

// 'Must be summoned to your location. / Automatically follows you and can't
//  move itself away.'
// FAQ: "Cerberus can't choose to move to a location that is farther from your avatar than its current
// location. (Count distance using steps that Cerberus would take using its own modes of movement, e.g.
// Airborne if it gained it somehow.)"
function fromAvatar(state: GameState, self: UnitState, at: Step, avatar: UnitState): number {
  const vertical = at.region === avatar.region ? 0 : 1 // under the surface is a step down from it
  if (!effKeywords(state, self).airborne) return stepDistanceW(state, at, avatar) + vertical
  return Math.max(Math.abs(at.x - avatar.x), Math.abs(at.y - avatar.y)) + vertical // Airborne: diagonals are one step
}

registerScript('Cerberus in Chains', {
  summonFilter: (state, player, at) => {
    const avatar = Object.values(state.units).find((u) => u.isAvatar && u.controller === player)
    return avatar && avatar.x === at.x && avatar.y === at.y ? null : 'Cerberus must be summoned to your location.'
  },
  summonAnywhere: true,
  // can't move ITSELF away: an own step may not end farther from its master than it started
  stepFilter: (state, unit, from, to) => {
    const avatar = Object.values(state.units).find((u) => u.isAvatar && u.controller === unit.controller)
    if (!avatar) return true
    return fromAvatar(state, unit, to, avatar) <= fromAvatar(state, unit, from, avatar)
  },
  onUnitEntersSquare: (ctx, moved) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !moved.isAvatar || moved.controller !== ctx.controller) return
    if (self.x !== moved.x || self.y !== moved.y) {
      ctx.teleport(self.id, moved.x, moved.y, moved.region)
      pushLog(ctx.state, ctx.controller, 'Cerberus pads along at its master’s heel.')
    }
  },
})
