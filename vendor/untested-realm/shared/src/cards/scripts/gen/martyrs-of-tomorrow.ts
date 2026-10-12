import { registerScript, type EffectAPI } from '../registry'
import { isEvilUnit } from '../../../engine/statics'
import { pushLog, wardUnit } from '../../../engine/effects'
import type { GameState, UnitState } from '../../../engine/types'

// evil = Demon/Undead/Monster, honoring subtype overrides (Corruptor et al.)
const isEvilU = (state: GameState, u: UnitState) => isEvilUnit(state, u)

// 'Deathrite → Ward an allied minion.'
registerScript('Martyrs of Tomorrow', {
  deathrite: (ctx) => {
    const allies = Object.values(ctx.state.units)
      .filter((u) => u.controller === ctx.controller && !u.isAvatar && u.id !== ctx.sourceId && !u.ward && !isEvilU(ctx.state, u))
      .map((u) => u.id)
    if (!allies.length) return
    if (allies.length === 1) return martyrWard(ctx, allies[0])
    // several eligible allies → the controller chooses which to Ward
    ctx.ask({ kind: 'chooseTargets', title: 'Ward which allied minion?', data: { candidates: allies, count: 1, kind: 'unit' } }, 'ward')
  },
  conts: {
    ward: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') martyrWard(ctx, id)
    },
  },
})

function martyrWard(ctx: EffectAPI, id: string) {
  const ally = ctx.state.units[id]
  if (ally && wardUnit(ctx.state, ally)) pushLog(ctx.state, ctx.controller, `The Martyrs' sacrifice wards ${ally.name}.`)
}
