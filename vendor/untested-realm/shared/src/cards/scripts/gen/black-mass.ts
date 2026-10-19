import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, revealCards, askOrder } from '../../../engine/effects'
import { isEvilCardFor } from '../multi-card-utils/is-evil-card-for'

// 'Search your top seven spells. You may reveal and draw three different Evil
// minions from among them. Put the rest at the bottom of your spellbook.'
// FAQ: "What order are the cards put on the bottom of my spellbook? You choose the order."
registerScript('Black Mass', {
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.slice(0, 7)
    p.spellbook = p.spellbook.slice(top.length)
    // a SEARCH is private — only the Evil minions taken are revealed (in `took`)
    pushLog(ctx.state, ctx.controller, `Black Mass searches the top ${top.length} spells.`)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.blackMass = top
    ctx.state.flow.blackMassDrawn = []
    pickEvil(ctx, 3)
  },
  conts: {
    took: (ctx, contCtx, choice) => {
      const pool: string[] = ctx.state.flow?.blackMass ?? []
      if (choice && choice !== '(done)') {
        const idx = pool.findIndex((id) => ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [id] = pool.splice(idx, 1)
          ctx.state.players[ctx.controller].hand.push(id)
          revealCards(ctx.state, ctx.controller, [String(choice)]) // opponent sees the revealed minion
          // track drawn names so duplicates can't be picked again
          ctx.state.flow = ctx.state.flow ?? {}
          ;(ctx.state.flow.blackMassDrawn as string[]).push(choice as string)
        }
      }
      if (choice && choice !== '(done)' && contCtx.left - 1 > 0) pickEvil(ctx, contCtx.left - 1)
      else bottomTheRest(ctx)
    },
  },
})

/** the searched spells not drawn go to the bottom, in the order the caster chooses */
function bottomTheRest(ctx: EffectAPI) {
  const rest: string[] = [...(ctx.state.flow?.blackMass ?? [])]
  if (ctx.state.flow) { ctx.state.flow.blackMass = []; ctx.state.flow.blackMassDrawn = [] }
  askOrder(ctx.state, ctx.controller, 'spellbook', rest, 'bottom', 'Black Mass: order the rest onto the bottom (first = very bottom)')
}

function pickEvil(ctx: EffectAPI, left: number) {
  const pool: string[] = ctx.state.flow?.blackMass ?? []
  const alreadyDrawn: string[] = ctx.state.flow?.blackMassDrawn ?? []
  const evil = [...new Set(
    pool
      .map((id) => ctx.state.cards[id].name)
      .filter((n) => !alreadyDrawn.includes(n) && getCard(n).type === 'Minion' && isEvilCardFor(ctx.state, ctx.controller, n))
  )]
  if (!evil.length) return bottomTheRest(ctx)
  ctx.ask({ kind: 'chooseOption', title: `Draw an Evil minion (${left} left)?`, data: { options: [...evil, '(done)'] } }, 'took', { left })
}
