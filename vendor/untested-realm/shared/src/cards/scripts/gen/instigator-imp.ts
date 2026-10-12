import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import { fightUnits } from '../../../engine/combat'

// 'Genesis → Make two enemy minions at target nearby location fight each other.'
registerScript('Instigator Imp', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const squares = nearbySquaresW(ctx.state, self.x, self.y).filter(
      // nearby minions are region-locked to the source
      (s) => unitsAt(ctx.state, s.x, s.y, self.region).filter((u) => u.controller !== ctx.controller && !u.isAvatar).length >= 2,
    )
    if (!squares.length) return
    if (squares.length === 1) return instigateAt(ctx, squares[0])
    // several candidate locations → the controller chooses which one
    ctx.ask({ kind: 'chooseSquare', title: 'Make two enemy minions fight where?', data: { squares } }, 'instigate')
  },
  conts: {
    instigate: (ctx, _c, choice) => {
      const { x, y } = choice ?? {}
      if (x === undefined) return
      instigateAt(ctx, { x, y })
    },
    instigateFight: (ctx, _c, choice) => {
      const ids = Array.isArray(choice) ? choice : [choice]
      if (ids.length < 2 || typeof ids[0] !== 'string' || typeof ids[1] !== 'string') return
      instigatorFight(ctx, ids[0], ids[1])
    },
  },
})

// at `sq`, take the enemy non-avatar minions; exactly 2 fight, more → the controller picks the two.
function instigateAt(ctx: EffectAPI, sq: { x: number; y: number }) {
  // nearby minions are region-locked to the source
  const self = ctx.state.units[ctx.sourceId]
  const foes = unitsAt(ctx.state, sq.x, sq.y, self?.region).filter((u) => u.controller !== ctx.controller && !u.isAvatar)
  if (foes.length < 2) return
  if (foes.length === 2) return instigatorFight(ctx, foes[0].id, foes[1].id)
  ctx.ask(
    { kind: 'chooseTargets', title: 'Which two minions fight?', data: { candidates: foes.map((u) => u.id), count: 2, kind: 'unit' } },
    'instigateFight',
  )
}

// simultaneous fight: the two brawl — a real strike exchange (fires Interrogator, Lethal, kill triggers…)
function instigatorFight(ctx: EffectAPI, aId: string, bId: string) {
  const a = ctx.state.units[aId]
  const b = ctx.state.units[bId]
  if (!a || !b) return
  pushLog(ctx.state, ctx.controller, `The Imp goads ${a.name} and ${b.name} into a brawl!`)
  fightUnits(ctx.state, a, b)
}
