import { registerScript } from '../registry'
import { pushLog, wardUnit } from '../../../engine/effects'

// '(1) → Ward a minion that was summoned this turn.'
registerScript('Savior', {
  abilities: [{
    key: 'save',
    label: '① → Ward a minion summoned this turn',
    cost: { mana: 1 },
    usableFromCemetery: true, // wards a summoned minion regardless of where the Savior is → Vivien can do it from the cemetery
    targets: [{
      what: 'minion', count: 1, targeted: false, label: 'a minion summoned this turn',
      filter: (state, u) => u.enteredTurn === state.turn,
    }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (!t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (u && u.enteredTurn === ctx.state.turn) {
        if (wardUnit(ctx.state, u)) pushLog(ctx.state, ctx.controller, `The Savior's blessing wards ${u.name}.`)
      }
    },
  }],
})
