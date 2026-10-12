import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isKnightSirDame as knightly } from '../multi-card-utils/knightly'

// (Battlemage already scripted in m1.)

// 'The first Knight, Sir, or Dame you cast each turn costs (1) less.'
registerScript('Templar', {
  costModifier: (state, sourceId, caster, cardName) => {
    const self = state.units[sourceId]
    if (!self || caster.controller !== self.controller) return 0
    if (!knightly(cardName) || getCard(cardName).type !== 'Minion') return 0
    return state.flow?.templarKnight?.[self.controller] === state.turn ? 0 : -1
  },
  onSpellCast: (ctx, by, cardName) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || by !== self.controller) return
    if (!knightly(cardName) || getCard(cardName).type !== 'Minion') return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.templarKnight = { ...(ctx.state.flow.templarKnight ?? {}), [by]: ctx.state.turn }
  },
})
