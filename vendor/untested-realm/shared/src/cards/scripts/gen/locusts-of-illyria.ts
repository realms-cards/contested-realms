import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

// 'At the end of your turn, if no new Locusts have been summoned this turn,
// summon a tapped copy of this nearby.'
// FAQ (faq_dump.md §Locusts of Illyria): "new Locusts" counts ONLY copies made by THIS
// end-of-turn ability — NOT the ones you cast/summoned normally. So on the turn you first
// summon Locusts, none were ability-spread yet → you DO get a copy; thereafter the first
// trigger's copy blocks the rest, netting exactly +1 per turn. We mark each spread copy with
// a `locustSpread: <turn>` counter and gate on that (was: any Locust that entered this turn,
// which wrongly suppressed the first-turn spread).
function spreadLocust(ctx: EffectAPI, x: number, y: number): void {
  const copy = copyUnit(ctx.state, 'Locusts of Illyria', ctx.controller, x, y, 'surface', true)
  if (copy) copy.counters = { ...copy.counters, locustSpread: ctx.state.turn }
  pushLog(ctx.state, ctx.controller, 'The swarm spreads...')
}

registerScript('Locusts of Illyria', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    ctx.state.flow = ctx.state.flow ?? {}
    // FAQ: at most ONE ability-spread per turn across ALL your Locusts. CLAIM the spread the
    // moment a Locust decides to (before the choose-a-site prompt), so a second Locust's
    // trigger sees the claim even though the copy isn't summoned until that prompt resolves.
    // (The old "any Locust with locustSpread===turn" check missed this: with several nearby
    // sites the copy is made in the cont, AFTER every Locust's trigger already ran → 2+ copies.)
    if (ctx.state.flow.locustSpreadTurn === ctx.state.turn) return
    // a copy may spread onto ANY nearby site, including the opponent's (siteAt = any site).
    const spots = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y) && !(s.x === self.x && s.y === self.y))
    if (spots.length === 0) return // this Locust has nowhere to spread — leave the claim for another
    ctx.state.flow.locustSpreadTurn = ctx.state.turn // claim BEFORE any prompt
    if (spots.length === 1) {
      spreadLocust(ctx, spots[0].x, spots[0].y)
      return
    }
    // "summon a tapped copy ... NEARBY" — the controller chooses which nearby site
    ctx.ask({ kind: 'chooseSquare', title: 'Locusts spread — summon the copy at which nearby site?', data: { squares: spots.map((s) => ({ x: s.x, y: s.y })) } }, 'spread')
  },
  conts: {
    spread: (ctx, _c, choice) => {
      if (!choice || typeof choice.x !== 'number') return
      spreadLocust(ctx, choice.x, choice.y)
    },
  },
})

/** create a token-copy of a unit; it enters the realm → Genesis fires (FAQ 1242) */
function copyUnit(state: GameState, name: string, controller: PlayerId, x: number, y: number, region: any, tapped = false): UnitState | null {
  const cardId = `c${state.nextId++}`
  state.cards[cardId] = { id: cardId, name, owner: controller, isToken: true }
  const unitId = `u${state.nextId++}`
  const unit: UnitState = {
    id: unitId, cardId, name, owner: controller, controller, isAvatar: false, x, y, region,
    tapped, damage: 0, enteredTurn: state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  return effectSummonUnit(state, unit)
}
