import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { effKeywords, isDisabled } from '../../../engine/statics'

// 'Gain ② this turn for each allied Spellcaster here.'
registerScript('Occult Ritual', {
  onCast: (ctx) => {
    const c = ctx.caster!
    let n = 0
    for (const u of unitsAt(ctx.state, c.x, c.y, c.region)) {
      if (u.controller !== ctx.controller || isDisabled(ctx.state, u)) continue
      if (effKeywords(ctx.state, u).spellcaster) n++
    }
    ctx.state.players[ctx.controller].mana += 2 * n
    ctx.log(`Occult Ritual grants ${2 * n} mana this turn.`)
  },
})
