import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { effectSummonUnit } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// ================= cards =================

// 'Spellcaster / Tap â†’ Search your hand, cemetery, or spellbook for another Adept
// Illusionist and summon it nearby. Shuffle if needed.'
// summon a fresh Adept Illusionist (from `cardId`) onto a chosen nearby site
function summonIllusionist(ctx: EffectAPI, cardId: string, x: number, y: number): void {
  effectSummonUnit(ctx.state, {
    // "summon another Adept Illusionist" = another copy of THIS card (cardId) — self-referential,
    // so a copier of this ability (Vivien) summons another copy of ITSELF.
    id: `u${ctx.state.nextId++}`, cardId, name: ctx.state.cards[cardId]?.name ?? 'Adept Illusionist', owner: ctx.state.cards[cardId].owner,
    controller: ctx.controller, isAvatar: false, x, y, region: 'surface',
    tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
    carryingUnits: [], usedThisTurn: {},
  })
  ctx.log('Another Adept Illusionist shimmers into being.')
}

registerScript('Adept Illusionist', {
  abilities: [{
    key: 'mirror',
    label: 'Tap → Summon another Adept Illusionist nearby',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const p = ctx.state.players[ctx.controller]
      const zones: ['hand', 'cemetery', 'spellbook'] = ['hand', 'cemetery', 'spellbook']
      for (const zone of zones) {
        // "another Adept Illusionist" = another copy of THIS card — search by the acting unit's own
        // name, so if the ability is copied (Vivien), it hunts for another copy of the copier.
        const idx = p[zone].findIndex((id) => ctx.state.cards[id].name === self.name)
        if (idx < 0) continue
        const [cardId] = p[zone].splice(idx, 1)
        if (zone === 'spellbook') ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
        // "summon it NEARBY": the controller chooses which nearby site (own square included).
        // Only prompt when there's a real choice; one (or zero) option summons directly.
        const spots = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y))
        if (spots.length <= 1) {
          const spot = spots[0] ?? { x: self.x, y: self.y }
          summonIllusionist(ctx, cardId, spot.x, spot.y)
        } else {
          ctx.ask({ kind: 'chooseSquare', title: 'Summon the other Adept Illusionist at which nearby site?', data: { squares: spots.map((s) => ({ x: s.x, y: s.y })) } }, 'mirror', { cardId })
        }
        return
      }
      ctx.log('No other Adept Illusionist found.')
    },
  }],
  conts: {
    mirror: (ctx, c, choice) => {
      if (!choice || typeof choice.x !== 'number' || typeof choice.y !== 'number') return
      const cardId = (c as { cardId?: string }).cardId
      if (cardId) summonIllusionist(ctx, cardId, choice.x, choice.y)
    },
  },
})
