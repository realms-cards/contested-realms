// One-file-per-card (refactor pilot). Filename = kebab-case card name; the module self-registers on
// import and is auto-wired by `npm run gen:card-index`.
import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Stealth / Loses Stealth if it moves.'
registerScript('Moss Troll', {
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId) return
    const self = ctx.state.units[ctx.sourceId]
    if (self?.stealth) {
      self.stealth = false
      pushLog(ctx.state, ctx.controller, 'The Moss Troll rumbles out of hiding.')
    }
  },
})
