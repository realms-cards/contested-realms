import { registerScript } from '../registry'
import { pushLog, randomDeterminer, isLucky } from '../../../engine/effects'
import { squareLabel, GRID_W, GRID_H } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'
import { coneSquares, rollLanding, landingLabel, applyLanding } from './special-helpers'

registerScript('Chaos Twister', {
  targets: [{ what: 'minion', count: 1, targeted: true, label: 'target minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const minion = ctx.state.units[t.unit]
    if (!minion) return
    const origin = ctx.extra?.origin as { x: number; y: number } | undefined
    const dir = ctx.extra?.direction as import('./special-helpers').BlowDirection | undefined
    if (!origin || !dir) return ctx.log('The twister fizzles: no blow direction chosen.')

    const state = ctx.state as GameState
    const cone = coneSquares(origin, dir)
    pushLog(state, ctx.controller, `${minion.name} is placed on the back of the hand... and blown ${dir === 'n' ? 'north' : dir === 's' ? 'south' : dir === 'e' ? 'east' : 'west'}!`)

    // Kythera Mechanism / Black Cat: a player determines the outcome instead
    const det = randomDeterminer(state, ctx.controller)
    if (det !== null) {
      // the crash can land on ANY square — a site (damage) or a void square (banished unless Voidwalk) —
      // or off the board, so the determiner may pick any of them (matches rollLanding's full outcome set).
      const squares: string[] = []
      for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) squares.push(`lands at ${squareLabel(x, y)}`)
      const options = [...squares, 'flies off the board']
      ctx.ask({ kind: 'chooseOption', title: 'Fate bends: determine where the minion lands.', data: { options }, player: det }, 'land', { minionId: minion.id })
      return
    }
    // Lucky Charm: roll twice, the caster picks one outcome
    if (isLucky(state, ctx.controller)) {
      const a = rollLanding(state, cone)
      const b = rollLanding(state, cone)
      if (landingLabel(a) !== landingLabel(b)) {
        ctx.ask(
          { kind: 'chooseOption', title: 'Lucky Charm: two gusts — choose which happens.', data: { options: [landingLabel(a), landingLabel(b)] } },
          'land',
          { minionId: minion.id },
        )
        return
      }
      applyLanding(ctx, minion.id, a)
      return
    }
    applyLanding(ctx, minion.id, rollLanding(state, cone))
  },
  conts: {
    land: (ctx, c, choice) => {
      if (typeof choice !== 'string') return
      const m = /\((\d+),(\d+)\)/.exec(choice)
      const landing = m ? { x: Number(m[1]) - 1, y: Number(m[2]) - 1 } : null
      applyLanding(ctx, c.minionId as string, landing)
    },
  },
})
