import { registerScript } from '../registry'
import { pushLog, spellHandIds, toCemetery } from '../../../engine/effects'
import { effectCastHandCard } from '../../../engine/casting'

 // the build permission lives on the Apex

// Apex: 'When the Tower of Babel is built, draw a spell, then you may cast a
// spell for free.'
registerScript('The Apex of Babel', {
  mayReplaceSite: (_state, _player, existing) => existing.name === 'The Base of Babel',
  // once built, the merged Tower provides (2) mana and (A)(E) (FAQ)
  siteExtraManaFn: (state, siteId) => (state.sites[siteId]?.counters?.tower ? 1 : 0),
  siteExtraThreshold: (state, site) => (state.sites[site.id]?.counters?.tower ? { earth: 1 } : {}),
  onSelfDestroyed: (ctx) => {
    // the Tower falls: the Base inside it reaches the cemetery too (FAQ)
    const baseCard = ctx.state.flow?.towerBase
    if (baseCard && ctx.state.cards[baseCard]) {
      toCemetery(ctx.state, baseCard)
      delete ctx.state.flow.towerBase
    }
  },
  genesis: (ctx) => {
    const site = ctx.state.sites[ctx.sourceId]
    const marker = ctx.state.flow?.lastReplacedSite
    const built = !!site && marker?.by === site.cardId && marker?.name === 'The Base of Babel'
    if (marker && built) delete ctx.state.flow.lastReplacedSite
    if (!built) return
    pushLog(ctx.state, ctx.controller, '🗼 The Tower of Babel is built!')
    // the Base merges INTO the Tower rather than resting in the cemetery
    if (site) {
      site.counters = { ...site.counters, tower: 1 }
      const p0 = ctx.state.players
      for (const pid of [0, 1] as const) {
        const at = p0[pid].cemetery.findIndex((id) => ctx.state.cards[id].name === 'The Base of Babel')
        if (at >= 0) {
          ctx.state.flow.towerBase = p0[pid].cemetery.splice(at, 1)[0]
          break
        }
      }
      ctx.state.players[ctx.controller].mana += 1 // the merged Tower provides (2); the Base's (1) was already counted at play
    }
    ctx.draw(ctx.controller, 'spellbook', 1)
    // "cast a spell for free" — a site cannot be cast, so offer only spells.
    const spells = spellHandIds(ctx.state, ctx.controller)
    if (!spells.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'The Tower grants one free casting — cast which spell? (skip for none)', data: { cards: spells.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'freebie',
      { spellIds: spells },
    )
  },
  conts: {
    // id-based: `choice` indexes the candidate spell list captured at ask time.
    freebie: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const ids = (c.spellIds as string[]) ?? []
      const cardId = typeof idx === 'number' ? ids[idx] : undefined
      if (typeof cardId !== 'string' || !ctx.state.players[ctx.controller].hand.includes(cardId)) return
      // "cast a spell for free" — cast it IMMEDIATELY (driving its own target/placement prompts),
      // not flag-it-for-later. (Anti-pattern: don't leave a free-cast credit hanging in hand.)
      effectCastHandCard(ctx.state, ctx.controller, cardId, { free: true })
    },
  },
})
