import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isEvilUnit } from '../../../engine/statics'
import { selfStepsCloser, stepDistance } from '../../../engine/movement'
import type { GameState, UnitState } from '../../../engine/types'

const isEvilU = (state: GameState, u: UnitState) => isEvilUnit(state, u)

// 'Once on your turn, Persecutor may step toward the closest Evil, or brand an
//  enemy so your cards treat them as Evil this turn.'
registerScript('Persecutor', {
  subtypeOverride: (state, selfId, unit, st) => {
    const brand = state.flow?.branded
    if (brand && brand.unitId === unit.id && brand.turn === state.turn && !st.includes('Monster')) return [...st, 'Monster']
    return st
  },
  abilities: [{
    key: 'zeal',
    label: 'Step toward Evil, or brand an enemy',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'The Persecutor…', data: { options: ['steps toward the closest Evil', 'brands an enemy as Evil'] } }, 'zeal')
    },
  }],
  conts: {
    zeal: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof choice !== 'string') return
      if (choice.startsWith('steps')) {
        const evils = Object.values(ctx.state.units).filter((u) => !u.isAvatar && isEvilU(ctx.state, u))
        if (!evils.length) return ctx.log('No Evil stalks the realm.')
        const minD = Math.min(...evils.map((e) => stepDistance(self, e)))
        // every square that steps closer to ANY of the equally-closest Evils is legal —
        // the player chooses the direction (dedupe squares by coordinate)
        const byCoord = new Map<string, { x: number; y: number }>()
        for (const e of evils.filter((e) => stepDistance(self, e) === minD)) {
          for (const s of selfStepsCloser(ctx.state, self, e)) byCoord.set(`${s.x},${s.y}`, { x: s.x, y: s.y })
        }
        const steps = [...byCoord.values()]
        if (!steps.length) return ctx.log('No step brings the Persecutor closer.')
        if (steps.length === 1) {
          ctx.teleport(self.id, steps[0].x, steps[0].y, self.region)
          pushLog(ctx.state, ctx.controller, 'The Persecutor stalks toward the nearest Evil.')
          return
        }
        ctx.ask({ kind: 'chooseSquare', title: 'The Persecutor stalks — which way?', data: { squares: steps } }, 'persecutorStep')
      } else {
        const enemies = Object.values(ctx.state.units).filter((u) => u.controller !== ctx.controller && !u.stealth).map((u) => u.id)
        if (!enemies.length) return
        ctx.ask({ kind: 'chooseTargets', title: 'Brand which enemy as Evil this turn?', data: { candidates: enemies, count: 1, upTo: false, kind: 'unit' } }, 'brand')
      }
    },
    brand: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.branded = { unitId: u.id, by: ctx.controller, turn: ctx.state.turn }
      pushLog(ctx.state, ctx.controller, `${u.name} is branded a heretic — Evil in the Persecutor's eyes.`)
    },
    persecutorStep: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (self && sq) {
        ctx.teleport(self.id, sq.x, sq.y, self.region)
        pushLog(ctx.state, ctx.controller, 'The Persecutor stalks toward the nearest Evil.')
      }
    },
  },
})
