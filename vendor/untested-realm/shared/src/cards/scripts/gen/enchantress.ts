import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import type { PlayerId, Region } from '../../../engine/types'

// 'Whenever you cast a spell, you may animate target aura until your next turn.
//  It's an aura minion with power equal to its cost.'
registerScript('Enchantress', {
  onSpellCast: (ctx, by) => {
    if (by !== ctx.controller) return
    const auras = Object.values(ctx.state.auras).filter(
      (r) => !Object.values(ctx.state.units).some((u) => String(u.counters?.animatedAura ?? '') === r.id),
    )
    if (!auras.length) return
    // flag the cast so castSpell defers the spell's resolution behind this prompt — the animate must
    // resolve BEFORE the spell does (before a cast minion enters + its Genesis fires). See castSpell.
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.enchantAnimatePending = true
    // pick the aura by clicking it ON THE BOARD (chooseTargets kind:'aura'); it's a
    // "may", so upTo:true offers a skip. The choice IS the aura id.
    ctx.ask(
      { kind: 'chooseTargets', title: 'Enchantress: animate which aura until your next turn?', data: { candidates: auras.map((r) => r.id), count: 1, upTo: true, kind: 'aura' } },
      'animate',
      {},
    )
  },
  startOfTurn: (ctx) => {
    // animations from the previous turn end; the minions dissolve back into auras
    const list: { unitId: string; player: PlayerId; turn: number }[] = ctx.state.flow?.auraAnimations ?? []
    const keep: typeof list = []
    for (const a of list) {
      if (a.player === ctx.controller && a.turn < ctx.state.turn) {
        const u = ctx.state.units[a.unitId]
        if (u) {
          // whoever controls the MINION when it settles back keeps the aura — an opponent who
          // took control of the animated minion now controls the enchantment it reverts to.
          const aura = ctx.state.auras[String(u.counters?.animatedAura ?? '')]
          if (aura) aura.controller = u.controller
          delete ctx.state.units[a.unitId]
          pushLog(ctx.state, ctx.controller, `${u.name} settles back into a mere enchantment.`)
        }
      } else {
        keep.push(a)
      }
    }
    if (ctx.state.flow) ctx.state.flow.auraAnimations = keep
  },
  // NB: "animated minion leaves the realm → its aura is destroyed with it" is handled centrally in
  // removeUnitFromRealm (so it fires on EVERY exit — death, Bury/flood, banish, exile — and even when
  // the Enchantress herself has already left), not by a listener here.
  conts: {
    animate: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id !== 'string') return // skipped — animating is a "may"
      const aura = ctx.state.auras[id]
      if (!aura) return
      const cost = getCard(aura.name).cost ?? 0
      const unitId = `u${ctx.state.nextId++}`
      // the aura minion occupies exactly the aura's AREA:
      //   • border/wall aura → the two bordered squares (a 2x1 / 1x2 body)
      //   • 2x2 aura         → an oversized 2x2 minion
      //   • single-site aura → a plain 1x1 minion
      let x: number, y: number
      let size: '2x2' | undefined
      let extraSquares: { x: number; y: number; region: Region }[] | undefined
      if (aura.edge) {
        x = aura.edge.a.x; y = aura.edge.a.y
        extraSquares = [{ x: aura.edge.b.x, y: aura.edge.b.y, region: 'surface' }]
      } else if (aura.squares.length >= 4) {
        const tl = aura.anchor ?? { x: Math.min(...aura.squares.map((s) => s.x)), y: Math.min(...aura.squares.map((s) => s.y)) }
        x = tl.x; y = tl.y; size = '2x2'
      } else {
        x = aura.squares[0].x; y = aura.squares[0].y
        const rest = aura.squares.slice(1).map((s) => ({ x: s.x, y: s.y, region: 'surface' as Region }))
        extraSquares = rest.length ? rest : undefined
      }
      // Summoning sickness ONLY if the aura itself was cast this turn (FAQ-style:
      // animating a long-standing enchantment doesn't newly "summon" it).
      const enteredTurn = aura.enteredTurn ?? -1
      ctx.state.units[unitId] = {
        id: unitId, cardId: aura.cardId, name: aura.name, owner: ctx.state.cards[aura.cardId]?.owner ?? ctx.controller,
        // FAQ3: opponent still controls the aura minion when their aura is animated.
        controller: aura.controller, isAvatar: false, x, y, region: 'surface', tapped: false,
        damage: 0, enteredTurn,
        modifiers: [{ kind: 'power', amount: cost, duration: 'permanent', turn: ctx.state.turn, sourcePlayer: ctx.controller }],
        carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animatedAura: aura.id as any },
        ...(size ? { size } : {}),
        ...(extraSquares ? { extraSquares } : {}),
      }
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.auraAnimations = [...(ctx.state.flow.auraAnimations ?? []), { unitId, player: ctx.controller, turn: ctx.state.turn }]
      pushLog(ctx.state, ctx.controller, `${aura.name} stirs to life (${cost} power)!`)
    },
  },
})
