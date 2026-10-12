import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { cemeteryProtected } from '../../../engine/statics'
import { effectCastSpell } from '../../../engine/casting'
import type { PlayerId } from '../../../engine/types'

// 'Spellcaster / Genesis → May cast an Ordinary magic from a cemetery, banishing
//  it afterward.'
registerScript('Skeleton Mage', {
  genesis: (ctx) => {
    const options: { cardId: string; owner: PlayerId }[] = []
    for (const p of ctx.state.players) {
      for (const id of p.cemetery) {
        const def = getCard(ctx.state.cards[id].name)
        if (def.type === 'Magic' && def.rarity === 'Ordinary') options.push({ cardId: id, owner: p.id })
      }
    }
    if (!options.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Skeleton Mage: take up which Ordinary magic? (skip for none)', data: { cards: options.map((o) => ctx.state.cards[o.cardId].name), pick: 1, upTo: true } },
      'exhume',
      { options },
    )
  },
  conts: {
    exhume: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const pick = (c.options as { cardId: string; owner: PlayerId }[])[idx]
      if (!pick) return
      if (cemeteryProtected(ctx.state, pick.owner, ctx.controller)) {
        return pushLog(ctx.state, ctx.controller, 'Wormelow Tump seals that cemetery shut.')
      }
      const owner = ctx.state.players[pick.owner]
      const at = owner.cemetery.indexOf(pick.cardId)
      if (at < 0) return
      const name = ctx.state.cards[pick.cardId].name
      owner.cemetery.splice(at, 1)
      if (!ctx.state.cards[pick.cardId].isToken) owner.banished.push(pick.cardId) // "banishing it afterward"
      // Skeleton Mage CASTS the magic now (it's the Spellcaster), paying its cost — not lent to hand
      effectCastSpell(ctx.state, ctx.controller, name, { caster: ctx.sourceId, grantsCasting: true, free: false })
      pushLog(ctx.state, ctx.controller, `${name} is cast from the grave, then crumbles to dust.`)
    },
  },
})
