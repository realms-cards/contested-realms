import { registerScript, getScript } from '../registry'
import { getCard } from '../../db'
import { effectCastSpell, casterCandidatesFor } from '../../../engine/casting'
import { zoneAccessToll } from '../../../engine/statics'
import { pushLog, bumpManaSpent } from '../../../engine/effects'

// 'Banish three magic spells in your cemetery → Cast a copy of one of them.'
// (Archimago: the copy is a normal cast — it still pays its mana cost and meets thresholds, per FAQ)
registerScript('Archimago', {
  abilities: [{
    key: 'echo',
    label: 'Banish 3 dead magics → recast one',
    cost: {},
    usableFromCemetery: true, // operates on the cemetery + recasts; no activator position → usable from the grave
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      const magics = p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Magic')
      if (magics.length < 3) return ctx.log('You need three magic spells in your cemetery.')
      // Bureau of Occult Control tolls (2) for reaching into the cemetery — gate early so a player who
      // can't pay it doesn't bother picking (the toll itself is charged at the commit, in pickBanish).
      const toll = zoneAccessToll(ctx.state)
      if (p.mana < toll) return ctx.log(`The Bureau of Occult Control demands (${toll}) for cemetery access.`)
      // WHICH magic to echo is the player's choice (a specific card, so duplicates are unambiguous).
      // upTo:true → a "Take none" button lets you cancel the ability (cost is free, nothing committed).
      ctx.ask(
        { kind: 'chooseCards', title: 'Echo which dead magic? (you pay its cost to cast the copy)', data: { cards: magics.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true, skipLabel: '✕ Cancel' } },
        'pickEcho',
        { magics },
      )
    },
  }],
  conts: {
    pickEcho: (ctx, c, choice) => {
      const magics = c.magics as string[]
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number' || !magics[idx]) return
      const echoId = magics[idx]
      const rest = magics.filter((id) => id !== echoId)
      // …and so are the TWO OTHER magics burned alongside it (was an arbitrary "first three").
      // upTo:true → "Take none" cancels (the cont below aborts unless exactly two are chosen).
      ctx.ask(
        { kind: 'chooseCards', title: 'Banish which TWO more magics alongside it?', data: { cards: rest.map((id) => ctx.state.cards[id].name), pick: 2, upTo: true, skipLabel: '✕ Cancel' } },
        'pickBanish',
        { echoId, rest },
      )
    },
    pickBanish: (ctx, c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const echoId = c.echoId as string
      const rest = c.rest as string[]
      const idxs = (Array.isArray(choice) ? choice : [choice]).filter((i) => typeof i === 'number') as number[]
      const others = idxs.map((i) => rest[i]).filter(Boolean)
      if (others.length < 2 || !ctx.state.cards[echoId]) return
      // Bureau of Occult Control toll (2) for the cemetery access — paid now, at the commit
      const toll = zoneAccessToll(ctx.state)
      if (p.mana < toll) return pushLog(ctx.state, ctx.controller, `The Bureau of Occult Control demands (${toll}) for cemetery access.`)
      const echoName = ctx.state.cards[echoId].name
      for (const id of [echoId, ...others]) { // banish all three (the echoed one + the two chosen)
        p.cemetery = p.cemetery.filter((x) => x !== id)
        if (!p.banished.includes(id)) p.banished.push(id)
      }
      if (toll) { p.mana -= toll; bumpManaSpent(ctx.state, ctx.controller, toll) }
      // "Cast a copy" — CAST it for real now (prompting for its targets); the copy MUST still
      // pay its mana cost and meet its elemental thresholds (FAQ), so free:false. The token
      // copy is cleaned up after it resolves; it must NOT sit in hand.
      pushLog(ctx.state, ctx.controller, `Archimago echoes ${echoName}.`)
      // FAQ: "any of your spellcasters can cast the copied spell" — so when the caster's position
      // matters (a projectile fires from the caster; a targeted spell is cast from it) and you have
      // more than one spellcaster, let the player pick which one. For a targetless spell the caster
      // is irrelevant, so just auto-cast (no needless prompt).
      const casters = casterCandidatesFor(ctx.state, ctx.controller, echoName)
      const sc = getScript(echoName)
      const positional = !!sc?.shootsProjectile || !!sc?.targets?.length
      if (positional && casters.length > 1) {
        ctx.ask(
          { kind: 'chooseTargets', title: `Which spellcaster casts ${echoName}?`, data: { candidates: casters, count: 1, kind: 'unit' } },
          'pickCaster',
          { echoName },
        )
        return
      }
      effectCastSpell(ctx.state, ctx.controller, echoName, { free: false, caster: casters[0] })
    },
    pickCaster: (ctx, c, choice) => {
      const echoName = c.echoName as string
      const id = Array.isArray(choice) ? choice[0] : choice
      effectCastSpell(ctx.state, ctx.controller, echoName, { free: false, caster: typeof id === 'string' ? id : undefined })
    },
  },
})
