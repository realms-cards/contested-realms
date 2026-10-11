import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// "Artifacts here can't be dropped and each deals 1 damage to its bearer at the
//  end of each turn."
registerScript('Cursed Iron', {
  aurasPreventDrop: true,
  endOfEveryTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    for (const a of Object.values(ctx.state.artifacts)) {
      if (!a.carriedBy) continue
      const bearer = ctx.state.units[a.carriedBy]
      // "Artifacts here" is the aura's SURFACE layer — a burrowed/submerged bearer under an affected
      // square isn't seared.
      if (!bearer || bearer.region !== 'surface' || !aura.squares.some((s) => s.x === bearer.x && s.y === bearer.y)) continue
      ctx.dealDamage({ unit: bearer.id }, 1)
      pushLog(ctx.state, bearer.controller, `The cursed iron sears ${bearer.name}.`)
    }
  },
})
