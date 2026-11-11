import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { checkWard, checkStateBased } from '../../../engine/effects'
import type { GameState } from '../../../engine/types'

/** enemy units at the Manor that it can TARGET (the site's controller is the one who feeds). Any unit
 *  occupying it counts — a 2x2 one or an Avatar stretched onto it (The Rack) included; a Stealthed one
 *  can't be targeted. */
function preyAt(state: GameState, siteId: string): string[] {
  const self = state.sites[siteId]
  if (!self) return []
  return unitsAt(state, self.x, self.y).filter((u) => u.controller !== self.controller && !u.stealth).map((u) => u.id)
}

// '(A)(A)(A)(A) — Once on your turn, this may deal 3 damage to target enemy
//  here to heal you 3.'
registerScript('The Manor at Daperyll Hill', {
  abilities: [{
    key: 'feast',
    label: '3 damage to an enemy here → heal 3',
    cost: {},
    threshold: { air: 4 },
    oncePerTurn: true,
    // nothing to feed on → not offered (it would spend the once-per-turn and log a heal that never happens)
    available: (state, sourceId) => preyAt(state, sourceId).length > 0,
    effect: (ctx) => {
      const prey = preyAt(ctx.state, ctx.sourceId)
      if (!prey.length) return ctx.log('No enemy dines at the Manor.')
      ctx.ask({ kind: 'chooseTargets', title: 'The Manor feeds on whom?', data: { candidates: prey, count: 1, upTo: false, kind: 'unit' } }, 'feast')
    },
  }],
  conts: {
    feast: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : undefined
      if (!u || !preyAt(ctx.state, ctx.sourceId).includes(u.id)) return
      // targeted by a special ability: a Ward breaks instead, and the effect is prevented (no damage, no heal)
      if (checkWard(ctx.state, u, ctx.controller, u.controller, 'target')) return ctx.log(`${u.name}'s ward breaks — the Manor goes hungry.`)
      // FAQ: "the full 3 damage must be dealt to the targeted minion here in order to heal 3" — not if
      // it's reduced, prevented (a Ward) or redirected. Measured on the target: an Avatar's damage is life
      // lost; a minion's is its damage counter (deaths settle after the effect, so it's still here).
      const lifeBefore = u.life ?? 0
      const dmgBefore = u.damage
      ctx.dealDamage({ unit: u.id }, 3)
      const after = ctx.state.units[u.id]
      // (an Avatar's life stops at 0 — Death's Door — so one knocked down to 0 took all of it)
      const dealt = u.isAvatar
        ? (after && after.life === 0 && lifeBefore > 0 ? 3 : lifeBefore - (after?.life ?? lifeBefore))
        : (after?.damage ?? dmgBefore) - dmgBefore
      if (dealt < 3) return ctx.log('The Manor feeds on too little — no healing.')
      // a victim that dies leaves the realm, which splits the event (Codex, Splitting Events on the
      // Storyline): its Deathrite (Maiden, Mother, Crone: you lose 3) resolves before the rest — the heal
      checkStateBased(ctx.state)
      ctx.gainLife(ctx.controller, 3)
    },
  },
})
