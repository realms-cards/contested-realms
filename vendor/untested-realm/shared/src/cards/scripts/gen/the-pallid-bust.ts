import { registerScript, getScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { payZoneToll, cemeteryProtected } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// --------------------------------------------------------- The Pallid Bust ----
// 'Genesis → Banish a dead minion. / Minion bearer has the banished minion's
//  printed types and abilities.'
registerScript('The Pallid Bust', {
  genesis: (ctx) => {
    const entries: { cardId: string; owner: PlayerId; name: string }[] = []
    for (const pid of [0, 1] as PlayerId[]) {
      if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
      for (const id of ctx.state.players[pid].cemetery) {
        const name = ctx.state.cards[id].name
        if (getCard(name).type === 'Minion') entries.push({ cardId: id, owner: pid, name })
      }
    }
    if (!entries.length) return ctx.log('No dead minion to immortalize.')
    if (!payZoneToll(ctx.state, ctx.controller)) {
      return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
    }
    ctx.ask(
      { kind: 'chooseCards', title: 'The Pallid Bust is carved in whose likeness?', data: { cards: entries.map((e) => `${e.name} (${ctx.state.players[e.owner].name})`), pick: 1, upTo: false } },
      'carve',
      { entries },
    )
  },
  conts: {
    carve: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const e = (c.entries as { cardId: string; owner: PlayerId; name: string }[])[idx]
      if (!e) return
      const cem = ctx.state.players[e.owner].cemetery
      if (!cem.includes(e.cardId)) return
      cem.splice(cem.indexOf(e.cardId), 1)
      ctx.state.players[e.owner].banished.push(e.cardId)
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.pallidBust = { ...(ctx.state.flow.pallidBust ?? {}), [ctx.sourceId]: e.name }
      pushLog(ctx.state, ctx.controller, `The Pallid Bust now bears ${e.name}'s pallid features.`)
    },
  },
  subtypeOverride: (state, selfId, unit, st) => {
    const art = state.artifacts[selfId]
    const name = state.flow?.pallidBust?.[selfId] as string | undefined
    if (!art || !name || art.carriedBy !== unit.id || unit.isAvatar) return st
    const extra = getCard(name).subtypes.filter((t) => !st.includes(t))
    return [...st, ...extra]
  },
  artifactGrantsAbilities: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    const name = state.flow?.pallidBust?.[artifactId] as string | undefined
    if (!art || !name || art.carriedBy !== unit.id || unit.isAvatar) return []
    return (getScript(name)?.abilities ?? []).map((a) => ({ ...a, contOwner: a.contOwner ?? name }))
  },
})
