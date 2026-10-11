import { registerScript } from '../registry'
import { getCard } from '../../db'
import { searchLimit } from '../../../engine/statics'
import { shuffleWithSeed } from '../../../engine/rng'
import { revealCards } from '../../../engine/effects'

// 'Search your spellbook for different Beasts with a combined mana cost of X or
// less, reveal them, and put them in your hand. Shuffle your spellbook.'
registerScript('Assorted Animals', {
  // X is the mana you spend to search — with none it fetches nothing, so require (1).
  extraCastCheck: (state, player) =>
    state.players[player].mana >= 1 ? null : 'Assorted Animals needs at least (1) mana to spend on X.',
  onCast: (ctx) => {
    const max = ctx.state.players[ctx.controller].mana
    if (max <= 0) return ctx.log('No mana left for X.')
    const options = Array.from({ length: max }, (_, i) => String(i + 1))
    ctx.ask({ kind: 'chooseOption', title: `Assorted Animals: choose X (you have ${max} mana)`, data: { options } }, 'chooseX')
  },
  conts: {
    chooseX: (ctx, _c, choice) => {
      const x = Number(choice) || 0
      const p = ctx.state.players[ctx.controller]
      if (x <= 0 || p.mana < x) return
      ctx.spendMana(ctx.controller, x)
      const window = searchLimit(ctx.state, ctx.controller)
      const pool = window === Infinity ? p.spellbook : p.spellbook.slice(0, window)
      const beasts = [...new Set(pool.map((id) => ctx.state.cards[id].name))].filter((n) => {
        const d = getCard(n)
        return d.type === 'Minion' && d.subtypes.includes('Beast') && (d.cost ?? 99) <= x
      })
      if (!beasts.length) {
        ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
        return ctx.log('No fitting Beasts found.')
      }
      pickBeast(ctx, x, [], beasts)
    },
    took: (ctx, contCtx, choice) => {
      const p = ctx.state.players[ctx.controller]
      if (choice && choice !== '(done)') {
        const win = searchLimit(ctx.state, ctx.controller)
        const idx = p.spellbook.findIndex((id, i) => (win === Infinity || i < win) && ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [id] = p.spellbook.splice(idx, 1)
          revealCards(ctx.state, ctx.controller, [ctx.state.cards[id].name]) // "reveal them" — opponent sees each fetched Beast
          p.hand.push(id)
          const spent = contCtx.spentNames.concat(String(choice))
          const used = spent.reduce((a: number, n: string) => a + (getCard(n).cost ?? 0), 0)
          const rewin = searchLimit(ctx.state, ctx.controller)
          const repool = rewin === Infinity ? p.spellbook : p.spellbook.slice(0, rewin)
          const remaining = [...new Set(repool.map((cid) => ctx.state.cards[cid].name))].filter((n) => {
            const d = getCard(n)
            return d.type === 'Minion' && d.subtypes.includes('Beast') && !spent.includes(n) && (d.cost ?? 99) <= contCtx.x - used
          })
          if (remaining.length) return pickBeast(ctx, contCtx.x, spent, remaining)
        }
      }
      ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
    },
  },
})

function pickBeast(ctx: any, x: number, spentNames: string[], options: string[]) {
  const used = spentNames.reduce((a: number, n: string) => a + (getCard(n).cost ?? 0), 0)
  ctx.ask(
    { kind: 'chooseOption', title: `Fetch a Beast (budget left: ${x - used})`, data: { options: [...options, '(done)'] } },
    'took',
    { x, spentNames },
  )
}
