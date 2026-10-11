import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'

// 'Spellcaster / Genesis → Banish target adjacent Demon, Spirit, or aura.'
registerScript('Arjaro Exorcist', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const units = adjacentSquaresW(ctx.state, self.x, self.y)
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => !u.isAvatar && (hasSubtype(ctx.state, u, 'Demon') || hasSubtype(ctx.state, u, 'Spirit')) && !(u.stealth && u.controller !== ctx.controller))
      .map((u) => u.id)
    const auras = Object.values(ctx.state.auras)
      .filter((r) => r.squares.some((s) => adjacentSquaresW(ctx.state, self.x, self.y).some((a) => a.x === s.x && a.y === s.y)))
      .map((r) => r.id)
    const candidates = [...new Set([...units, ...auras])]
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Exorcise which Demon, Spirit, or aura?', data: { candidates, count: 1, upTo: true, kind: 'unitOrAura' } }, 'exorcise')
  },
  conts: {
    exorcise: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (!id) return
      if (ctx.state.units[id]) ctx.banish(id)
      else if (ctx.state.auras[id]) {
        pushLog(ctx.state, ctx.controller, `${ctx.state.auras[id].name} is exorcised.`)
        delete ctx.state.auras[id]
      }
    },
  },
})
