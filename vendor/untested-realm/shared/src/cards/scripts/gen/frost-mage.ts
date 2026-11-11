import { registerScript } from '../registry'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'
import { isUnmodifiable } from '../../../engine/statics'

// 'Tap → Play or draw a site. / (A)(A)(W)(W), (2), Once on your turn → Encase target nearby minion in ice.
// It is disabled and takes no damage until your next turn.'
// The no-damage half is a prevention that lasts as long as the disable: flow.encased (effects.ts lists it
// with the damage preventers; turn.ts lets it go at the start of the Frost Mage's next turn).
registerScript('Frost Mage', {
  abilities: [{
    key: 'encase',
    label: 'Encase a nearby minion in ice',
    cost: { mana: 2 },
    threshold: { air: 2, water: 2 },
    oncePerTurn: true,
    targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      const u = t && 'unit' in t ? ctx.state.units[t.unit] : undefined
      if (!u) return
      // a minion that "can't be modified" can't be encased at all — neither half sticks
      if (isUnmodifiable(ctx.state, u)) return ctx.log(`${u.name} can't be encased.`)
      disableUntilYourNextTurn(ctx.state, u.id, ctx.controller)
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.encased = [...(ctx.state.flow.encased ?? []), { unitId: u.id, player: ctx.controller, turn: ctx.state.turn }]
      ctx.log(`${u.name} is encased in ice.`)
    },
  }],
})
