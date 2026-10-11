import { registerScript, getScript } from '../registry'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { effAttack, isEvilUnit } from '../../../engine/statics'

// 'Banish an Evil ally → Cast Rasputin from your cemetery to there. He adds
//  their power and abilities to his own until he dies again.'
registerScript('Grigori Rasputin', {
  cemeteryAbilities: (state, cardId, owner) => [{
    key: `rasputin:${cardId}`,
    label: 'Banish an Evil ally → Rasputin returns in their place',
    cost: {},
    effect: (ctx) => {
      const evils = Object.values(ctx.state.units)
        .filter((u) => u.controller === ctx.controller && !u.isAvatar && isEvilUnit(ctx.state, u))
        .map((u) => u.id)
      if (!evils.length) return ctx.log('No Evil ally to feed the mad monk.')
      ctx.ask({ kind: 'chooseTargets', title: 'Rasputin claims whose flesh?', data: { candidates: evils, count: 1, upTo: false, kind: 'unit' } }, 'return', { cardId })
    },
  }],
  grantsAbilities: (state, selfId, unit) => {
    if (unit.id !== selfId) return []
    const absorbed = (state.flow?.rasputinAbsorbed ?? []).find((e: any) => e.unitId === selfId)
    return absorbed ? getScript(absorbed.name)?.abilities ?? [] : []
  },
  deathrite: (ctx) => {
    if (ctx.state.flow?.rasputinAbsorbed) {
      ctx.state.flow.rasputinAbsorbed = ctx.state.flow.rasputinAbsorbed.filter((e: any) => e.unitId !== ctx.sourceId)
    }
  },
  conts: {
    return: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const victim = typeof id === 'string' ? ctx.state.units[id] : null
      const cardId = c.cardId as string
      const p = ctx.state.players[ctx.controller]
      if (!victim || !p.cemetery.includes(cardId)) return
      const power = effAttack(ctx.state, victim)
      const { x, y, region } = victim
      const victimName = victim.name
      // banish the vessel
      const vcard = ctx.state.cards[victim.cardId]
      delete ctx.state.units[victim.id]
      if (vcard && !vcard.isToken) ctx.state.players[vcard.owner].banished.push(vcard.id)
      // Rasputin rises
      p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
      const unitId = `u${ctx.state.nextId++}`
      // Rasputin re-enters the realm from the cemetery → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name: ctx.state.cards[cardId]?.name ?? 'Grigori Rasputin', owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
        isAvatar: false, x, y, region, tapped: false, damage: 0, enteredTurn: ctx.state.turn,
        modifiers: [{ kind: 'power', amount: power, duration: 'permanent', turn: ctx.state.turn, sourcePlayer: ctx.controller }],
        carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.rasputinAbsorbed = [...(ctx.state.flow.rasputinAbsorbed ?? []), { unitId, name: victimName }]
      pushLog(ctx.state, ctx.controller, `Rasputin claws back from death, wearing ${victimName}'s strength!`)
    },
  },
})
