import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'

// 'Ward / Once on your turn, you may banish a dead minion to look at your top
// spell. You may put it at the bottom.'
registerScript('Clairvoyant', {
  abilities: [{
    key: 'gaze',
    label: 'Banish a dead minion → peek at your top spell',
    cost: {},
    oncePerTurn: true,
    usableFromCemetery: true, // banishes a dead minion + peeks your top spell (cemetery/spellbook only, no self-position) → Vivien can do it from the grave
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      const corpses = p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion')
      if (!corpses.length) return ctx.log('No dead minion to burn.')
      if (corpses.length === 1) return clairvoyantBurn(ctx, corpses[0])
      // several corpses → the controller chooses which to banish
      ctx.ask(
        { kind: 'chooseCards', title: 'Banish which dead minion?', data: { cards: corpses.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
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
      if (choice !== 'put on bottom') return
      const p = ctx.state.players[ctx.controller]
      const id = p.spellbook.shift()
      if (id !== undefined) p.spellbook.push(id)
    },
  },
})

// banish the chosen corpse, then offer the top-spell peek.
function clairvoyantBurn(ctx: EffectAPI, corpseId: string) {
  const p = ctx.state.players[ctx.controller]
  const idx = p.cemetery.indexOf(corpseId)
  if (idx < 0) return
  const [dead] = p.cemetery.splice(idx, 1)
  p.banished.push(dead)
  const topId = p.spellbook[0]
  if (topId === undefined) return
  ctx.ask(
    { kind: 'chooseOption', title: `Top spell: ${ctx.state.cards[topId].name}. Put it on the bottom?`, data: { options: ['keep on top', 'put on bottom'] } },
    'scry',
  )
}
