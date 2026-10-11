import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Airborne, Lethal / At the end of your turn, if you cast a non-fire spell this turn, untap Panorama Manticore.'
registerScript('Panorama Manticore', {
  onSpellCast: (ctx, by, cardName) => {
    if (by !== ctx.controller) return
    if (getCard(cardName).elements.includes('Fire')) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    self.counters = { ...self.counters, nonFireCastTurn: ctx.state.turn }
  },
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    if (self.counters?.nonFireCastTurn === ctx.state.turn) ctx.untap(self.id)
  },
})
