import { registerScript } from '../registry'
import { getCard } from '../../db'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Airborne, Immune to fire damage / Once on your turn, discard a fire card →
// Deal 3 damage to units at target adjacent location.'
registerScript('Ignis Rex', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId) return amount
    const fiery = source.elements?.includes('Fire') || (source.name ? getCard(source.name).elements.includes('Fire') : false)
    return fiery ? 0 : amount
  },
  abilities: [{
    key: 'roar',
    label: 'Discard a fire card → 3 damage at adjacent location',
    cost: {},
    oncePerTurn: true,
    targets: [{ what: 'square', count: 1, targeted: true, label: 'target adjacent location' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('square' in t)) return
      if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === t.square.x && s.y === t.square.y)) return ctx.log('Not adjacent.')
      // COST: "discard a fire card" — the controller chooses which when holding several
      const hasFire = ctx.state.players[ctx.controller].hand.some((id) => getCard(ctx.state.cards[id].name).elements.includes('Fire'))
      if (!hasFire) return ctx.log('No fire card to discard.')
      ctx.discardChoose(ctx.controller, { title: 'Ignis Rex — discard which fire card?', filter: (name) => getCard(name).elements.includes('Fire') })
      for (const u of Object.values(ctx.state.units)) {
        if (u.x === t.square.x && u.y === t.square.y && u.region === (t.square.region ?? self.region)) {
          ctx.dealDamage({ unit: u.id }, 3)
        }
      }
    },
  }],
})
