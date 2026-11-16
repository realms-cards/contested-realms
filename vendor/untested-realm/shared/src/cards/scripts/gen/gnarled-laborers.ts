import { registerScript } from '../registry'
import { untapUnit } from '../../../engine/effects'

// 'Untaps the first time they take damage each turn.'
// Only the turn's FIRST damage triggers it: if they're untapped then, it's spent for the turn. "The first
// time" is a fact of the game, not an ability: the damage pipeline stamps the turn's first hit on the unit
// (counters.firstDamagedTurn) and whether it then had no abilities (firstDamageMuted — silenced or
// disabled, so no untap). A later hit that turn, after the silence/disable ends, isn't the first.
// The trigger's first call this turn is that first hit's (simultaneous hits queue in order).
registerScript('Gnarled Laborers', {
  onSelfDamaged: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    self.counters = self.counters ?? {}
    if (self.counters.laborersHurtTurn === ctx.state.turn) return
    self.counters.laborersHurtTurn = ctx.state.turn
    if (self.counters.firstDamagedTurn === ctx.state.turn && self.counters.firstDamageMuted) return
    if (untapUnit(ctx.state, self)) ctx.log(`${self.name} untap.`)
  },
})
