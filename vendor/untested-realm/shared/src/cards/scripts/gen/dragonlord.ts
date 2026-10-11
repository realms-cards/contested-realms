import { registerScript, getScript, type EffectAPI } from '../registry'
import { allCards, getCard, getKeywords } from '../../db'
import { pushLog, pushPrompt } from '../../../engine/effects'
import { affinity, meetsThreshold } from '../../../engine/casting'

// 'Before setup, set aside a Unique Dragon. Once on your turn, if you meet its
//  threshold, you may pay (3) to gain its abilities this turn.'
// The set-aside choice is made on first use (functionally identical).
registerScript('Dragonlord', {
  // "Before setup, set aside a Unique Dragon." At game creation, prompt this player to
  // choose one from ALL unique dragons (a clickable card grid via nameCard+names). The
  // choice is stored in flow.dragonlordPick and surfaced in the view so the GUI can show
  // the set-aside dragon inside the avatar card.
  onSetup: (state, pid) => {
    const dragons = uniqueDragons()
    if (!dragons.length) return
    pushPrompt(state, {
      player: pid,
      kind: 'nameCard',
      title: 'Dragonlord — set aside a Unique Dragon (before setup)',
      data: { names: dragons },
      cont: 'script:Dragonlord:setAsidePre',
      ctx: { sourceId: state.players[pid].avatarUnitId, controller: pid },
    })
  },
  grantsAbilities: (state, selfId, unit) => {
    if (unit.id !== selfId) return []
    const form = state.flow?.dragonForm
    const self = state.units[selfId]
    if (!form || !self || form.player !== self.controller || form.turn !== state.turn) return []
    return getScript(form.name)?.abilities ?? []
  },
  selfKeywords: (state, self) => {
    const form = state.flow?.dragonForm
    if (!form || form.player !== self.controller || form.turn !== state.turn) return []
    const kw = getKeywords(form.name)
    const out: string[] = []
    if (kw.airborne) out.push('airborne')
    if (kw.charge) out.push('charge')
    if (kw.lethal) out.push('lethal')
    // NOT stealth — FAQ (Dragonlord): "Can the Dragonlord gain Stealth? A: No.
    // Avatars cannot gain Stealth." (Draco Corvus is the only Stealth Dragon.)
    if (kw.strikeFirst) out.push('strike first')
    if (kw.ranged) out.push(`ranged ${kw.ranged}`)
    if (kw.burrowing) out.push('burrowing')
    if (kw.submerge) out.push('submerge')
    if (kw.voidwalk) out.push('voidwalk')
    if (kw.spellcaster) out.push('spellcaster')
    if (kw.movement) out.push(`movement +${kw.movement}`)
    return out
  },
  abilities: [{
    key: 'invoke',
    label: '③ → Take on your Dragon’s aspect this turn',
    cost: { mana: 3 },
    oncePerTurn: true,
    effect: (ctx) => {
      const flow = (ctx.state.flow = ctx.state.flow ?? {})
      const pick = flow.dragonlordPick?.[ctx.controller]
      if (!pick) {
        // fallback: the pre-game set-aside was skipped — ask once now (then invoke)
        const dragons = uniqueDragons()
        if (!dragons.length) return ctx.log('No Unique Dragon exists.')
        ctx.ask({ kind: 'nameCard', title: 'Dragonlord: which Unique Dragon did you set aside?', data: { names: dragons } }, 'setAside')
        return
      }
      invokeDragon(ctx, pick)
    },
  }],
  conts: {
    // pre-game "set aside" — store the pick only (no invoke). Cancelling leaves it unset;
    // the in-game invoke below then asks once as a fallback.
    setAsidePre: (ctx, _c, name) => {
      if (typeof name !== 'string' || !name) return
      const def = getCard(name)
      if (def.rarity !== 'Unique' || !def.subtypes.includes('Dragon')) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.dragonlordPick = { ...(ctx.state.flow.dragonlordPick ?? {}), [ctx.controller]: name }
      pushLog(ctx.state, ctx.controller, `The Dragonlord sets aside ${name}.`)
    },
    setAside: (ctx, _c, name) => {
      if (typeof name !== 'string' || !name) return
      const def = getCard(name)
      if (def.rarity !== 'Unique' || !def.subtypes.includes('Dragon')) return ctx.log('That is no Unique Dragon.')
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.dragonlordPick = { ...(ctx.state.flow.dragonlordPick ?? {}), [ctx.controller]: name }
      invokeDragon(ctx, name)
    },
  },
})

/** every Unique Dragon minion name (the pool the Dragonlord sets one aside from). */
function uniqueDragons(): string[] {
  return allCards.filter((c) => c.type === 'Minion' && c.rarity === 'Unique' && c.subtypes.includes('Dragon')).map((c) => c.name)
}

function invokeDragon(ctx: EffectAPI, name: string): void {
  if (!meetsThreshold(affinity(ctx.state, ctx.controller), getCard(name).thresholds)) {
    ctx.state.players[ctx.controller].mana += 3 // refund — threshold not met
    return ctx.log(`You do not meet ${name}'s threshold.`)
  }
  ctx.state.flow.dragonForm = { player: ctx.controller, turn: ctx.state.turn, name }
  pushLog(ctx.state, ctx.controller, `The Dragonlord takes on the aspect of ${name}!`)
}
