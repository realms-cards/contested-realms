// Shared factory helpers for site card scripts (no registerScript — skipped by gen:card-index).

import { type CardScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Genesis → If this is the only <name> you control, gain ① this turn.'
export function towerScript(name: string): CardScript {
  return {
    genesis: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const copies = Object.values(ctx.state.sites).filter(
        (s) => s.name === name && s.controller === ctx.controller,
      )
      if (copies.length === 1) {
        ctx.state.players[ctx.controller].mana += 1
        ctx.log(`${name} hums with power: +① this turn.`)
      }
    },
  }
}

// 'Genesis → You may pay ① to summon a Foot Soldier token here.'
export const villageScript: CardScript = {
  genesis: (ctx) => {
    if (ctx.state.players[ctx.controller].mana < 1) return
    ctx.ask({ kind: 'yesNo', title: 'Pay ① to summon a Foot Soldier here?' }, 'footSoldier')
  },
  conts: {
    footSoldier: (ctx, contCtx, choice) => {
      if (!choice) return
      const p = ctx.state.players[ctx.controller]
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || p.mana < 1) return
      ctx.spendMana(ctx.controller, 1)
      ctx.summonToken('Foot Soldier', ctx.controller, self.x, self.y)
    },
  },
}

// 'Genesis → Deal 1 damage to each minion atop target nearby site.'
export const desertScript: CardScript = {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const candidates = Object.values(ctx.state.sites)
      .filter((s) => nearbySquaresW(ctx.state, self.x, self.y).some((sq) => sq.x === s.x && sq.y === s.y))
      .map((s) => s.id)
    if (candidates.length === 0) return
    ctx.ask(
      { kind: 'chooseTargets', title: 'Deal 1 damage to each minion atop which nearby site?', data: { candidates, count: 1, upTo: true, kind: 'site' } },
      'scorch',
    )
  },
  conts: {
    scorch: (ctx, contCtx, choice) => {
      const siteId = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[siteId]
      const self = ctx.state.sites[ctx.sourceId]
      if (!site || !self) return
      if (!nearbySquaresW(ctx.state, self.x, self.y).some((sq) => sq.x === site.x && sq.y === site.y)) return
      // Minions ATOP the site: surface units, plus any still lingering in the void of this (now sited)
      // square — casting the Desert under a voidwalker damages it even before checkStateBased lifts it
      // (a void unit on a sited square is atop the site, rulebook). Burrowed/submerged are below, not atop.
      for (const u of Object.values(ctx.state.units)) {
        if (u.isAvatar || u.x !== site.x || u.y !== site.y) continue
        if (u.region !== 'surface' && u.region !== 'void') continue
        ctx.dealDamage({ unit: u.id }, 1)
      }
    },
  },
}

// 'Genesis → Look at your next spell. You may put it on the bottom of your spellbook.'
export const riverScript: CardScript = {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const topId = p.spellbook[0]
    if (topId === undefined) return
    const name = ctx.state.cards[topId].name
    ctx.ask(
      { kind: 'chooseOption', title: `Your next spell is ${name}. Put it on the bottom?`, data: { options: ['keep on top', 'put on bottom'], reveal: name } },
      'scry',
    )
  },
  conts: {
    scry: (ctx, contCtx, choice) => {
      if (choice !== 'put on bottom') return
      const p = ctx.state.players[ctx.controller]
      const id = p.spellbook.shift()
      if (id !== undefined) {
        p.spellbook.push(id)
        pushLog(ctx.state, ctx.controller, 'The river carries the spell to the bottom.')
      }
    },
  },
}
