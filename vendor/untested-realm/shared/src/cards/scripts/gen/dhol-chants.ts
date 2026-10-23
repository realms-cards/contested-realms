import { registerScript } from '../registry'
import { pushLog, revealCards } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { noteAddedToEnd } from '../../../engine/knowledge'
import { canTapForCost } from '../../../engine/statics'

// 'Tap any number of nearby allies. Reveal that many spells from the top of
//  your spellbook and cast one for free. Put the rest at the bottom.'
registerScript('Dhol Chants', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    const allies = nearbySquaresW(ctx.state, caster.x, caster.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, caster.region))
      .filter((u) => u.controller === ctx.controller && canTapForCost(ctx.state, u))
      .map((u) => u.id)
    if (!allies.length) return ctx.log('No untapped allies to chant.')
    ctx.ask({ kind: 'chooseTargets', title: 'Which allies join the chant (tap them)?', data: { candidates: allies, count: allies.length, upTo: true, kind: 'unit' } }, 'chant')
  },
  conts: {
    chant: (ctx, _c, choice) => {
      const ids = Array.isArray(choice) ? choice : []
      let n = 0
      for (const id of ids) {
        const u = ctx.state.units[id]
        if (u && canTapForCost(ctx.state, u) && u.controller === ctx.controller) {
          u.tapped = true
          n++
        }
      }
      if (!n) return
      const p = ctx.state.players[ctx.controller]
      const revealed = p.spellbook.slice(0, n)
      if (!revealed.length) return
      revealCards(ctx.state, ctx.controller, revealed.map((id) => ctx.state.cards[id].name)) // "Reveal that many spells" — opponent sees them
      ctx.ask(
        { kind: 'chooseCards', title: 'The chants reveal — cast which for free?', data: { cards: revealed.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
        'echo',
        { revealed },
      )
    },
    echo: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const revealed = c.revealed as string[]
      const p = ctx.state.players[ctx.controller]
      p.spellbook = p.spellbook.filter((id) => !revealed.includes(id))
      let chosen: string | null = null
      if (typeof idx === 'number' && revealed[idx]) chosen = revealed[idx]
      if (chosen) {
        p.hand.push(chosen)
        ctx.state.flow = ctx.state.flow ?? {}
        ctx.state.flow.freeCast = [...(ctx.state.flow.freeCast ?? []), chosen]
        pushLog(ctx.state, ctx.controller, `${ctx.state.cards[chosen].name} may be cast for free.`)
      }
      const rest = revealed.filter((id) => id !== chosen)
      noteAddedToEnd(ctx.state, 'both', ctx.controller, 'spellbook', 'bottom', rest, () => p.spellbook.push(...rest))
    },
  },
})
