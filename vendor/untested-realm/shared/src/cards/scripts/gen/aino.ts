import { registerScript } from '../registry'
import { GRID_H, siteAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import type { GameState, Step, UnitState } from '../../../engine/types'

// 'At the end of your turn, Aino may take a step between the top and bottom edges
// of the realm to gain Stealth.'
// A step of her own (Codex, Step def. 2): an Immobile or disabled Aino can't take it, and an entry ban
// at the far edge still stops her (isLegalStep). The edge-crossing step exists only while this ability
// resolves: `flow.ainoSlip` names the Aino taking it, and her extraSteps offers it then.
function slipStep(state: GameState, unit: UnitState): Step | null {
  if (unit.region !== 'surface' || (unit.y !== 0 && unit.y !== GRID_H - 1)) return null
  const y = unit.y === 0 ? GRID_H - 1 : 0
  return siteAt(state, unit.x, y) ? { x: unit.x, y, region: 'surface' } : null
}

function legalSlip(state: GameState, unit: UnitState): Step | null {
  const to = slipStep(state, unit)
  if (!to) return null
  state.flow = state.flow ?? {}
  state.flow.ainoSlip = unit.id
  try {
    return isLegalStep(state, unit, { x: unit.x, y: unit.y, region: unit.region }, to) ? to : null
  } finally {
    delete state.flow.ainoSlip
  }
}

registerScript('Aino', {
  extraSteps: (state, unit, from) => {
    if (state.flow?.ainoSlip !== unit.id || from.x !== unit.x || from.y !== unit.y) return []
    const to = slipStep(state, unit)
    return to ? [to] : []
  },
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !legalSlip(ctx.state, self)) return
    ctx.ask({ kind: 'yesNo', title: 'Aino: slip across the realm and gain Stealth?' }, 'slip')
  },
  conts: {
    slip: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!choice || !self) return
      const to = legalSlip(ctx.state, self)
      if (!to) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.ainoSlip = self.id
      let moved = false
      try {
        moved = takeOwnStep(ctx.state, self, to)
      } finally {
        delete ctx.state.flow.ainoSlip
      }
      // "to gain Stealth" — only if she made the crossing
      if (moved && ctx.state.units[self.id]) {
        self.stealth = true
        pushLog(ctx.state, ctx.controller, 'Aino vanishes across the water.')
      }
    },
  },
})
