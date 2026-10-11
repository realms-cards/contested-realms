import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { hasSubtype, searchLimit } from '../../../engine/statics'
import { killUnit, revealCards } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// after the contract is sealed, offer the eligible spellbook cards to grant
function demonGrant(ctx: EffectAPI, maxRank: number): void {
  const rarityRank: Record<string, number> = { Ordinary: 0, Exceptional: 1, Elite: 2, Unique: 3 }
  const p = ctx.state.players[ctx.controller]
  const window = searchLimit(ctx.state, ctx.controller)
  const pool = window === Infinity ? p.spellbook : p.spellbook.slice(0, window)
  const names = [...new Set(pool.map((id) => ctx.state.cards[id].name).filter((n) => (rarityRank[getCard(n).rarity ?? 'Ordinary'] ?? 0) <= maxRank))]
  if (!names.length) return
  ctx.ask({ kind: 'chooseOption', title: 'The demon grants: choose a card', data: { options: names } }, 'grant')
}

// 'Search your spellbook for any card [rarity ≤ a Demon you control]. Pay 4 life
// or sacrifice [a Frog / a Mortal].'
registerScript('Demonic Contract', {
  onCast: (ctx) => {
    const rarityRank: Record<string, number> = { Ordinary: 0, Exceptional: 1, Elite: 2, Unique: 3 }
    const demons = Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller && !u.isAvatar && hasSubtype(ctx.state, u, 'Demon'))
    if (!demons.length) return ctx.log('You control no Demon to bargain with.')
    const maxRank = Math.max(...demons.map((d) => rarityRank[getCard(d.name).rarity ?? 'Ordinary'] ?? 0))
    const sacrificable = Object.values(ctx.state.units).filter(
      (u) => u.controller === ctx.controller && !u.isAvatar && (u.name === 'Frog' || hasSubtype(ctx.state, u, 'Mortal')),
    )
    const options = ['pay 4 life', ...(sacrificable.length ? ['sacrifice a soul'] : [])]
    ctx.ask({ kind: 'chooseOption', title: 'Seal the contract how?', data: { options } }, 'seal', { maxRank })
  },
  conts: {
    seal: (ctx, contCtx, choice) => {
      const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)!
      if (choice === 'pay 4 life') {
        avatar.life = Math.max(0, (avatar.life ?? 0) - 4)
        return demonGrant(ctx, contCtx.maxRank)
      }
      const souls = Object.values(ctx.state.units).filter(
        (u) => u.controller === ctx.controller && !u.isAvatar && (u.name === 'Frog' || hasSubtype(ctx.state, u, 'Mortal')),
      )
      if (souls.length <= 1) {
        if (souls[0]) killUnit(ctx.state, souls[0].id)
        return demonGrant(ctx, contCtx.maxRank)
      }
      // "sacrificing a ... soul" — the controller chooses WHICH soul to sacrifice
      ctx.ask({ kind: 'chooseTargets', title: 'Sacrifice which soul?', data: { candidates: souls.map((u) => u.id), count: 1, kind: 'unit' } }, 'pickSoul', { maxRank: contCtx.maxRank })
    },
    pickSoul: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (id && ctx.state.units[id]) killUnit(ctx.state, id)
      demonGrant(ctx, contCtx.maxRank)
    },
    grant: (ctx, _c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const win = searchLimit(ctx.state, ctx.controller)
      const idx = p.spellbook.findIndex((id, i) => (win === Infinity || i < win) && ctx.state.cards[id].name === choice)
      if (idx >= 0) {
        revealCards(ctx.state, ctx.controller, [String(choice)]) // "reveal it" — the opponent sees the tutored card
        const [id] = p.spellbook.splice(idx, 1)
        p.hand.push(id)
      }
      ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
    },
  },
})
