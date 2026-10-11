import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, toCemetery } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'
import { isUnmodifiable } from '../../../engine/statics'

// 'An allied minion tries to transform. Look at your next five spells: you may
//  choose a minion among them to be the new form. Put the rest on the bottom in
//  a random order.'
registerScript('Shapeshift', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.slice(0, 5)
    if (!top.length) return
    const minions = top.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion')
    ctx.ask(
      { kind: 'chooseCards', title: 'Shapeshift into which form? (only minions take)', data: { cards: top.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'morph',
      { unitId: t.unit, top, minionIds: minions },
    )
  },
  conts: {
    morph: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const p = ctx.state.players[ctx.controller]
      const top = c.top as string[]
      const u = ctx.state.units[c.unitId as string]
      let chosen: string | null = null
      if (typeof idx === 'number' && top[idx] && getCard(ctx.state.cards[top[idx]].name).type === 'Minion') chosen = top[idx]
      // remove the looked-at cards from the top
      p.spellbook = p.spellbook.filter((id) => !top.includes(id))
      if (chosen && u && !isUnmodifiable(ctx.state, u)) {
        u.name = ctx.state.cards[chosen].name
        u.damage = 0
        pushLog(ctx.state, ctx.controller, `The flesh flows — it is now ${u.name}!`)
        // the used form goes to the cemetery, the rest to the bottom
        toCemetery(ctx.state, chosen)
      }
      const rest = top.filter((id) => id !== chosen)
      ctx.state.seed = shuffleWithSeed(rest, ctx.state.seed)
      p.spellbook.push(...rest)
    },
  },
})
