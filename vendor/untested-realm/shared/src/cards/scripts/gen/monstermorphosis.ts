import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { cardSubtypesFor, collectionBanned, payZoneToll, takeFromCollection, isUnmodifiable } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'Disable target nearby minion until your next turn. At the start of that
//  turn, you may transform it into a Monster from your hand or a Horrible
//  Hybrids from your collection.'
registerScript('Monstermorphosis', {
  listensFromCemetery: true,
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    if (isUnmodifiable(ctx.state, u)) return ctx.log("That minion can't be modified.")
    u.disabled = true
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.morphoses = [
      ...(ctx.state.flow.morphoses ?? []),
      { unitId: u.id, player: ctx.controller, turn: ctx.state.turn },
    ]
    pushLog(ctx.state, ctx.controller, `${u.name} stiffens inside a glistening chrysalis.`)
  },
  startOfTurn: (ctx) => {
    const list = (ctx.state.flow?.morphoses ?? []) as { unitId: string; player: PlayerId; turn: number }[]
    const mine = list.find((m) => m.player === ctx.controller && m.turn < ctx.state.turn)
    if (!mine) return
    ctx.state.flow.morphoses = list.filter((m) => m !== mine)
    const victim = ctx.state.units[mine.unitId]
    if (!victim) return
    victim.disabled = undefined
    const p = ctx.state.players[ctx.controller]
    // "a Monster from your hand" — honor identity overrides so a Corruptor's Beasts
    // in hand count as Monsters (their printed subtype is Beast, not Monster).
    const monsters = p.hand.filter((id) => {
      const def = getCard(ctx.state.cards[id].name)
      return def.type === 'Minion' && cardSubtypesFor(ctx.state, ctx.controller, def.name).includes('Monster')
    })
    // "or a Horrible Hybrids from your collection" — only offer it when you actually
    // have one in your collection (and it isn't banished).
    const hasHybrids =
      (p.collection?.['Horrible Hybrids'] ?? 0) > 0 && !collectionBanned(ctx.state, ctx.controller, 'Horrible Hybrids')
    const options = [
      ...monsters.map((id) => ctx.state.cards[id].name),
      ...(hasHybrids ? ['Horrible Hybrids (collection)'] : []),
      '(let it wake)',
    ]
    ctx.ask({ kind: 'chooseOption', title: `The chrysalis cracks — what emerges from ${victim.name}?`, data: { options } }, 'emerge', { unitId: victim.id, monsters })
  },
  conts: {
    emerge: (ctx, c, choice) => {
      const victim = ctx.state.units[c.unitId as string]
      if (!victim || typeof choice !== 'string' || choice === '(let it wake)') return
      const p = ctx.state.players[ctx.controller]
      if (choice === 'Horrible Hybrids (collection)') {
        // must still actually have one (state can shift between prompt and answer)
        if ((p.collection?.['Horrible Hybrids'] ?? 0) <= 0) return
        if (collectionBanned(ctx.state, ctx.controller, 'Horrible Hybrids')) {
          return pushLog(ctx.state, ctx.controller, 'Every Horrible Hybrids in the collection was banished by the Legion of Gall.')
        }
        if (!payZoneToll(ctx.state, ctx.controller)) {
          return pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for collection access.')
        }
        takeFromCollection(ctx.state, ctx.controller, 'Horrible Hybrids') // consume the collection copy
        const cardId = `c${ctx.state.nextId++}`
        ctx.state.cards[cardId] = { id: cardId, name: 'Horrible Hybrids', owner: ctx.controller }
        victim.name = 'Horrible Hybrids'
        victim.cardId = cardId
      } else {
        const handId = (c.monsters as string[]).find((id) => ctx.state.cards[id].name === choice)
        if (!handId || !p.hand.includes(handId)) return
        p.hand.splice(p.hand.indexOf(handId), 1)
        victim.name = choice
        victim.cardId = handId
      }
      victim.damage = 0
      // FAQ: a TRANSFORM never changes control — if you morphed an ENEMY minion it stays
      // under your opponent's control (though the new card is owned by you, so it goes to
      // YOUR cemetery when it dies). So we deliberately do NOT reassign victim.controller.
      pushLog(ctx.state, ctx.controller, `The chrysalis bursts: ${victim.name}!`)
    },
  },
})
