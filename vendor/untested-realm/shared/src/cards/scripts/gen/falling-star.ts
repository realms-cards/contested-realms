import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { siteAt, unitsAt } from '../../../engine/grid'
import { effectSummonUnit, strikeAllSimultaneous } from '../../../engine/effects'
import { removeAura } from '../multi-card-utils/remove-aura'

// 'Lasts 3 of your turns. When the star falls, you may summon a minion from your
// hand atop an affected site. It strikes each other unit where it lands.'
registerScript('Falling Star', {
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (aura) aura.counters = { turns: 0 }
  },
  endOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    aura.counters = aura.counters ?? { turns: 0 }
    aura.counters.turns = (aura.counters.turns ?? 0) + 1
    if (aura.counters.turns < 3) return
    const p = ctx.state.players[ctx.controller]
    const minions = [...new Set(p.hand.map((id) => ctx.state.cards[id].name).filter((n) => getCard(n).type === 'Minion'))]
    const spots = aura.squares.filter((s) => siteAt(ctx.state, s.x, s.y))
    if (minions.length && spots.length) {
      ctx.ask({ kind: 'chooseOption', title: '☄ The star falls! Summon which minion?', data: { options: [...minions, '(none)'] } }, 'impact')
    } else {
      removeAura(ctx)
    }
  },
  conts: {
    impact: (ctx, _c, choice) => {
      const aura = ctx.state.auras[ctx.sourceId]
      if (!aura || !choice || choice === '(none)') return removeAura(ctx)
      const spots = aura.squares.filter((s) => siteAt(ctx.state, s.x, s.y))
      if (spots.length === 0) return removeAura(ctx)
      if (spots.length === 1) return fallSummon(ctx, spots[0].x, spots[0].y, String(choice))
      // "atop AN affected site" — the caster chooses which affected site
      ctx.ask({ kind: 'chooseSquare', title: `Summon ${choice} atop which affected site?`, data: { squares: spots.map((s) => ({ x: s.x, y: s.y })) } }, 'impactSpot', { name: String(choice) })
    },
    impactSpot: (ctx, c: any, sq: any) => {
      if (!sq || typeof sq.x !== 'number') return removeAura(ctx)
      fallSummon(ctx, sq.x, sq.y, String(c.name))
    },
  },
})

// summon the fallen star's minion atop the chosen affected site (Genesis fires; it
// then strikes everything already there), and dissolve the aura.
function fallSummon(ctx: EffectAPI, x: number, y: number, name: string): void {
  const p = ctx.state.players[ctx.controller]
  const idx = p.hand.findIndex((id) => ctx.state.cards[id].name === name)
  if (idx >= 0) {
    const [cardId] = p.hand.splice(idx, 1)
    const unitId = `u${ctx.state.nextId++}`
    const star = effectSummonUnit(ctx.state, {
      id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner,
      controller: ctx.controller, isAvatar: false, x, y, region: 'surface',
      tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
      carryingUnits: [], usedThisTurn: {},
    })
    if (star) {
      const targets = unitsAt(ctx.state, x, y, 'surface').filter((u) => u.id !== unitId).map((u) => u.id)
      if (targets.length) strikeAllSimultaneous(ctx.state, unitId, targets, ctx.controller)
    }
  }
  removeAura(ctx)
}
