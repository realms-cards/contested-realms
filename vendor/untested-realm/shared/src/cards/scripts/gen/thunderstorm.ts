import { registerScript, type EffectAPI } from '../registry'
import { pushLog, luckyChoiceIndex, toCemetery } from '../../../engine/effects'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, deal 3 damage to a random unit atop affected sites,
//  then you may move Thunderstorm one step. Lasts 3 of your turns.'
registerScript('Thunderstorm', {
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (aura) aura.counters = { turns: 3 }
  },
  endOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    const targets = aura.squares
      .filter((s) => siteAt(ctx.state, s.x, s.y))
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, 'surface'))
    if (!targets.length) return thunderAfter(ctx) // nobody to strike — just age/drift
    // the random strike target may be bent by Lucky Charm / Kythera
    const pick = ctx.lucky(targets.map((u) => ({ label: u.name, payload: u.id })), 'zap', 'cards')
    if (pick !== undefined) thunderStrike(ctx, pick as string)
    // else: pending — the 'zap' cont strikes, then ages/drifts
  },
  conts: {
    zap: (ctx, c, choice) => thunderStrike(ctx, (c.__opts as string[])[luckyChoiceIndex(c, choice)]),
    drift: (ctx, _c, choice) => {
      const aura = ctx.state.auras[ctx.sourceId]
      if (!aura || typeof choice !== 'string' || choice === 'stay') return
      const dx = choice === 'east' ? 1 : choice === 'west' ? -1 : 0
      const dy = choice === 'north' ? 1 : choice === 'south' ? -1 : 0
      if (aura.squares.every((s) => inBounds(s.x + dx, s.y + dy))) {
        aura.squares = aura.squares.map((s) => ({ x: s.x + dx, y: s.y + dy }))
      }
    },
  },
})

// Thunderstorm: deal the lightning, THEN age the storm and offer the drift (order matters)
function thunderStrike(ctx: EffectAPI, victimId: string): void {
  const v = ctx.state.units[victimId]
  if (v) {
    ctx.dealDamage({ unit: victimId }, 3)
    pushLog(ctx.state, ctx.controller, `⚡ Lightning strikes ${v.name}!`)
  }
  thunderAfter(ctx)
}

// age the storm one turn; when it expires, dispel it — else offer the one-step drift
function thunderAfter(ctx: EffectAPI): void {
  const aura = ctx.state.auras[ctx.sourceId]
  if (!aura) return
  aura.counters = aura.counters ?? { turns: 3 }
  aura.counters.turns -= 1
  if (aura.counters.turns <= 0) {
    const card = ctx.state.cards[aura.cardId]
    if (card) toCemetery(ctx.state, card.id)
    delete ctx.state.auras[ctx.sourceId]
    pushLog(ctx.state, ctx.controller, 'The Thunderstorm blows itself out.')
    return
  }
  ctx.ask({ kind: 'chooseOption', title: 'Drift the storm one step?', data: { options: ['north', 'south', 'east', 'west', 'stay'] } }, 'drift')
}
