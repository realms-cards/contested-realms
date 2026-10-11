import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, revealCards } from '../../../engine/effects'
import { isEvilCardFor } from '../multi-card-utils/is-evil-card-for'

// 'Search your top seven spells. You may reveal and draw three different Evil
// minions from among them. Put the rest at the bottom of your spellbook.'
registerScript('Black Mass', {
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.slice(0, 7)
    p.spellbook = p.spellbook.slice(top.length)
    const names = top.map((id) => ctx.state.cards[id].name)
    pushLog(ctx.state, ctx.controller, `Black Mass reveals: ${names.join(', ')}`)
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
      else {
        ctx.state.players[ctx.controller].spellbook.push(...(ctx.state.flow?.blackMass ?? []))
        if (ctx.state.flow) { ctx.state.flow.blackMass = []; ctx.state.flow.blackMassDrawn = [] }
      }
    },
  },
})

function pickEvil(ctx: EffectAPI, left: number) {
  const pool: string[] = ctx.state.flow?.blackMass ?? []
  const alreadyDrawn: string[] = ctx.state.flow?.blackMassDrawn ?? []
  const evil = [...new Set(
    pool
      .map((id) => ctx.state.cards[id].name)
      .filter((n) => !alreadyDrawn.includes(n) && getCard(n).type === 'Minion' && isEvilCardFor(ctx.state, ctx.controller, n))
  )]
  if (!evil.length) {
    ctx.state.players[ctx.controller].spellbook.push(...pool)
    if (ctx.state.flow) { ctx.state.flow.blackMass = []; ctx.state.flow.blackMassDrawn = [] }
    return
  }
  ctx.ask({ kind: 'chooseOption', title: `Draw an Evil minion (${left} left)?`, data: { options: [...evil, '(done)'] } }, 'took', { left })
}
