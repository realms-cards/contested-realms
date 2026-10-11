import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Tap → The next Dragon you cast to this location costs (0) this turn.'
registerScript('Caelestis', {
  abilities: [{
    key: 'roost',
    label: 'Beckon a Dragon (next one here is free this turn)',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.caelestis = { player: ctx.controller, turn: ctx.state.turn, x: self.x, y: self.y, used: false }
      pushLog(ctx.state, ctx.controller, 'Caelestis sings — the skies stir with wings.')
    },
  }],
  costModifier: (state, _sourceId, caster, cardName, at) => {
    const f = state.flow?.caelestis
    if (!f || f.used || f.player !== caster.controller || f.turn !== state.turn || !at) return 0
    if (at.x !== f.x || at.y !== f.y) return 0
    if (!getCard(cardName).subtypes.includes('Dragon') || getCard(cardName).type !== 'Minion') return 0
    return -99
  },
  onUnitEnters: (ctx, entered) => {
    const f = ctx.state.flow?.caelestis
    if (!f || f.used || entered.controller !== f.player || entered.enteredTurn !== ctx.state.turn) return
    if (entered.x === f.x && entered.y === f.y && effSubtypes(ctx.state, entered).includes('Dragon')) f.used = true
  },
})
