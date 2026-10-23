import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { noteAddedToEnd, noteSeenAtEnd } from '../../../engine/knowledge'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'Ward / Once on your turn, you may banish a dead minion to look at your top
// spell. You may put it at the bottom.'
registerScript('Clairvoyant', {
  abilities: [{
    key: 'gaze',
    label: 'Banish a dead minion → peek at your top spell',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      // "a dead minion" is unqualified → a minion in EITHER cemetery counts
      const corpses: string[] = []
      for (const pid of [0, 1] as PlayerId[]) {
        if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
        for (const id of ctx.state.players[pid].cemetery) {
          if (getCard(ctx.state.cards[id].name).type === 'Minion') corpses.push(id)
        }
      }
      if (!corpses.length) return ctx.log('No dead minion to burn.')
      if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
      if (corpses.length === 1) return clairvoyantBurn(ctx, corpses[0])
      // several corpses → the controller chooses which to banish
      ctx.ask(
        { kind: 'chooseCards', title: 'Banish which dead minion?', data: { cards: corpses.map((id) => `${ctx.state.cards[id].name} (${ctx.state.players[ctx.state.cards[id].owner].name})`), pick: 1, upTo: false } },
        'burn',
        { corpseIds: corpses },
      )
    },
  }],
  conts: {
    burn: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const corpseIds = c.corpseIds as string[]
      if (typeof idx !== 'number' || idx < 0 || idx >= corpseIds.length) return
      clairvoyantBurn(ctx, corpseIds[idx])
    },
    scry: (ctx, _c, choice) => {
      const p = ctx.state.players[ctx.controller]
      if (choice !== 'put on bottom') {
        if (p.spellbook[0] !== undefined) noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'top', [p.spellbook[0]])
        return
      }
      const id = p.spellbook.shift()
      if (id !== undefined) noteAddedToEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'bottom', [id], () => p.spellbook.push(id))
    },
  },
})

// banish the chosen corpse, then offer the top-spell peek.
function clairvoyantBurn(ctx: EffectAPI, corpseId: string) {
  const p = ctx.state.players[ctx.controller]
  // the corpse may lie in either cemetery → banished to its owner's pile
  const holder = ([0, 1] as PlayerId[]).find((pid) => ctx.state.players[pid].cemetery.includes(corpseId))
  if (holder === undefined) return
  const cem = ctx.state.players[holder].cemetery
  cem.splice(cem.indexOf(corpseId), 1)
  ctx.state.players[ctx.state.cards[corpseId].owner].banished.push(corpseId)
  const topId = p.spellbook[0]
  if (topId === undefined) return
  noteSeenAtEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'top', [topId])
  ctx.ask(
    { kind: 'chooseOption', title: `Top spell: ${ctx.state.cards[topId].name}. Put it on the bottom?`, data: { options: ['keep on top', 'put on bottom'] } },
    'scry',
  )
}
