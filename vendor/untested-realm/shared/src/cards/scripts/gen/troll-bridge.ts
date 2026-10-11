import { registerScript, type EffectAPI } from '../registry'
import { pushLog, toCemetery, isCasterLocked } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'The first time a lone enemy enters here each turn, strike it unless they discard a card.'
registerScript('Troll Bridge', {
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    // "a lone ENEMY enters" — includes the enemy AVATAR (text says enemy, not minion); fires on forced
    // moves too (emitUnitMoved → onUnitEntersSquare). "lone" counts only UNITS at the site (unitsAt),
    // so co-located artifacts/auras never stop it from triggering.
    // A site's "here" spans surface AND subsurface, so an enemy swimming/burrowing in from outside the
    // site also enters here. `from` outside the site rules out an in-place region change.
    if (!self || moved.controller === self.controller) return
    if (moved.x !== self.x || moved.y !== self.y) return
    if (from.x === self.x && from.y === self.y) return
    if (unitsAt(ctx.state, self.x, self.y).filter((u) => u.controller === moved.controller).length > 1) return
    ctx.state.flow = ctx.state.flow ?? {}
    const key = `troll:${ctx.sourceId}`
    if (ctx.state.flow[key] === ctx.state.turn) return
    ctx.state.flow[key] = ctx.state.turn
    // caster-locked cards (Morgana's / an Omphalos's own spells) aren't a free part of the hand, so the
    // toll can't take them. Resolve by captured id, not hand index, since the list is now filtered.
    const ids = ctx.state.players[moved.controller].hand.filter((id) => !isCasterLocked(ctx.state, id))
    if (!ids.length) return trollStrike(ctx, moved.id)
    ctx.ask(
      { kind: 'chooseCards', title: 'Pay the toll: discard a card? (skip to be struck)', data: { cards: ids.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true }, player: moved.controller },
      'toll',
      { unitId: moved.id, ids },
    )
  },
  conts: {
    toll: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const u = ctx.state.units[c.unitId as string]
      if (!u) return
      const ids = (c.ids as string[]) ?? []
      const id = typeof idx === 'number' && idx >= 0 && idx < ids.length ? ids[idx] : undefined
      const p = ctx.state.players[u.controller]
      if (id && p.hand.includes(id)) {
        p.hand = p.hand.filter((h) => h !== id)
        toCemetery(ctx.state, id)
        pushLog(ctx.state, u.controller, `${u.name} pays the troll's toll.`)
      } else {
        trollStrike(ctx, u.id)
      }
    },
  },
})

function trollStrike(ctx: EffectAPI, unitId: string): void {
  const site = ctx.state.sites[ctx.sourceId]
  const u = ctx.state.units[unitId]
  if (!site || !u) return
  // the bridge itself strikes with power 3 (the troll beneath)
  ctx.dealDamage({ unit: unitId }, 3)
  pushLog(ctx.state, null, `The troll lashes out at ${u.name}!`)
}
