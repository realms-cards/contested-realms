import { registerScript, getScript } from '../registry'
import { pushLog, makeCtx } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'

// ---- transforms & copies ----

// 'Enters the realm as an Evil copy of an enemy minion, and strikes first if they fight.'
registerScript('Evil Twin', {
  genesisTargets: [{ what: 'minion', count: 1, targeted: false, owner: 'enemy', label: 'the enemy minion to copy' }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('unit' in t)) return
    const model = ctx.state.units[t.unit]
    if (!model) return
    // become a copy: swap the unit's name (stats/keywords follow the card def)
    self.name = model.name
    self.counters = { ...self.counters, evilTwin: 1 } // stays an EVIL copy (isEvilUnit)
    // "…and strikes first if THEY fight" = the twin vs the minion it copied, and
    // nothing else (owner ruling). The link lives in flow because the name swap
    // makes this script unreachable on the twin afterward; combat.ts consults it.
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.evilTwins = [...(ctx.state.flow.evilTwins ?? []), { twinId: self.id, originalId: model.id }]
    if (model.name === 'Faith Incarnate') awardAchievement(ctx.state, 'jesus-evil-twin', ctx.controller)
    if (model.name === 'Brother Knight') awardAchievement(ctx.state, 'long-lost-brother', ctx.controller)
    pushLog(ctx.state, ctx.controller, `The Evil Twin takes ${model.name}'s face...`)
    // "ENTERS THE REALM AS an Evil copy" — the entering thing IS the copy, so the
    // copied card's Genesis fires too (cf. Selfsame Simulacrum FAQ: "Does it copy
    // Genesis abilities? A: Yes"; 'basic copy' = printed characteristics). Required
    // genesis targets it cannot pick simply do as much as they can (empty targets).
    // NB: a transform (Monstermorphosis class) is NOT an entry and fires nothing.
    const copied = getScript(model.name)?.genesis
    if (copied && !self.silenced) copied(makeCtx(ctx.state, self.id, ctx.controller, []))
    // (negative-control proven: gating this call off turns the faq.test.ts
    // "Evil Twin enters AS the copy" test red with `expected +0 to be 1`)
  },
  // NB: no blanket strike-first grant — it applies ONLY against the copied
  // original ("if they fight"), enforced target-aware in combat.ts via
  // flow.evilTwins. Before the copy resolves there is no original to fight.
})
