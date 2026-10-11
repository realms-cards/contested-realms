import { registerScript } from '../registry'
import { getCard } from '../../db'
import { toCemetery } from '../../../engine/effects'

// 'Genesis → Search your top five spells for a minion to discard. Bottom the rest.'
registerScript('Forgotten Tomb', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.slice(0, 5)
    p.spellbook = p.spellbook.slice(top.length)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.tomb = top
    const minions = [...new Set(top.map((id) => ctx.state.cards[id].name).filter((n) => getCard(n).type === 'Minion'))]
    if (!minions.length) {
      p.spellbook.push(...top)
      ctx.state.flow.tomb = []
      return
    }
    ctx.ask({ kind: 'chooseOption', title: 'Entomb which minion (to the cemetery)?', data: { options: [...minions, '(none)'] } }, 'entomb')
  },
  conts: {
    entomb: (ctx, _c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const pool: string[] = ctx.state.flow?.tomb ?? []
      if (choice && choice !== '(none)') {
        const idx = pool.findIndex((id) => ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [id] = pool.splice(idx, 1)
          toCemetery(ctx.state, id)
        }
      }
      p.spellbook.push(...pool)
      if (ctx.state.flow) ctx.state.flow.tomb = []
    },
  },
})
