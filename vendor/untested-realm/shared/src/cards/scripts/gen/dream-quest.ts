import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'
import { effKeywords, searchLimit } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'An allied Spellcaster falls asleep and is disabled until hurt. At the start
//  of your next turn, if it's still asleep, you may wake it up to search your
//  spellbook for a card and put it into your hand. Shuffle if needed.'
registerScript('Dream-Quest', {
  listensFromCemetery: true,
  targets: [{
    what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied Spellcaster',
    filter: (state, unit) => effKeywords(state, unit).spellcaster === true,
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    u.disabled = true
    u.counters = { ...u.counters, asleep: 1 }
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.dreamQuests = [
      ...(ctx.state.flow.dreamQuests ?? []),
      { unitId: u.id, player: ctx.controller, turn: ctx.state.turn },
    ]
    pushLog(ctx.state, ctx.controller, `${u.name} drifts into the Dreamlands…`)
  },
  startOfTurn: (ctx) => {
    // fires from the cemetery at its caster's turn start
    const quests = (ctx.state.flow?.dreamQuests ?? []) as { unitId: string; player: PlayerId; turn: number }[]
    const mine = quests.find((q) => q.player === ctx.controller && q.turn < ctx.state.turn)
    if (!mine) return
    ctx.state.flow.dreamQuests = quests.filter((q) => q !== mine)
    const dreamer = ctx.state.units[mine.unitId]
    if (!dreamer || !dreamer.counters?.asleep) return
    ctx.ask({ kind: 'yesNo', title: `Wake ${dreamer.name} to claim the dream's prize?` }, 'wake', { unitId: dreamer.id })
  },
  conts: {
    wake: (ctx, c, yes) => {
      const dreamer = ctx.state.units[c.unitId as string]
      if (!yes || !dreamer) return
      dreamer.disabled = undefined
      if (dreamer.counters) delete dreamer.counters.asleep
      const p = ctx.state.players[ctx.controller]
      if (!p.spellbook.length) return
      const window = searchLimit(ctx.state, ctx.controller)
      const pool = window === Infinity ? p.spellbook : p.spellbook.slice(0, window)
      ctx.ask(
        { kind: 'chooseCards', title: 'The dream reveals your spellbook — take which card?', data: { cards: pool.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
        'prize',
      )
    },
    prize: (ctx, _c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const p = ctx.state.players[ctx.controller]
      const window = searchLimit(ctx.state, ctx.controller)
      const max = window === Infinity ? p.spellbook.length : Math.min(window, p.spellbook.length)
      if (typeof idx !== 'number' || idx < 0 || idx >= max) return
      const [id] = p.spellbook.splice(idx, 1)
      p.hand.push(id)
      ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
      pushLog(ctx.state, ctx.controller, `${ctx.state.cards[id].name} is carried back from the dream.`)
    },
  },
})
