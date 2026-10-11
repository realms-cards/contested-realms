import { registerScript, type EffectAPI } from '../registry'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { fightUnits } from '../../../engine/combat'

// "one at a time": the fights are sequential and the CONTROLLER picks the order. We resolve
// one, then re-offer the remaining living foes, until none are left — then the glory ends
// (flow.undying clears, so a mortally-wounded hero finally falls).
function blazeNext(ctx: EffectAPI, heroId: string, foeIds: string[]): void {
  const hero = ctx.state.units[heroId]
  const living = hero ? foeIds.filter((id) => { const f = ctx.state.units[id]; return f && f.controller !== hero.controller }) : []
  if (!hero || !living.length) {
    if (ctx.state.flow) ctx.state.flow.undying = null
    checkStateBased(ctx.state)
    return
  }
  if (living.length === 1) { // no order to choose — fight the last foe, then finish
    blazeFightOne(ctx, heroId, living[0])
    return blazeNext(ctx, heroId, [])
  }
  ctx.ask(
    { kind: 'chooseTargets', title: `Blaze of Glory — fight which enemy next? (${living.length} left)`, data: { candidates: living, count: 1, upTo: false, kind: 'unit' } },
    'blazeOrder',
    { hero: heroId, remaining: living },
  )
}

registerScript('Blaze of Glory', {
  // "an ally" (not "an allied minion") — so it may target your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const hero = ctx.state.units[t.unit]
    if (!hero) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.undying = hero.id // "It doesn't die until it's done" — kept alive across all its fights
    const foes = nearbySquaresW(ctx.state, hero.x, hero.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, hero.region))
      .filter((u) => u.controller !== hero.controller)
      .map((u) => u.id)
    pushLog(ctx.state, ctx.controller, `${hero.name} charges into a blaze of glory (${foes.length} foes)!`)
    blazeNext(ctx, hero.id, foes)
  },
  conts: {
    blazeOrder: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const heroId = String(c.hero)
      const remaining = (c.remaining as string[]).filter((x) => x !== id)
      if (typeof id === 'string') blazeFightOne(ctx, heroId, id)
      blazeNext(ctx, heroId, remaining)
    },
  },
})

// A single fight: the hero and one foe strike SIMULTANEOUSLY through the real combat machinery, so
// every strike trigger fires (Interrogator, Men of Leng…) and Lethal/lethalVs is honored. The hero is
// kept alive across all its fights by flow.undying; fightUnits settles THIS fight's deaths at pass end.
function blazeFightOne(ctx: EffectAPI, heroId: string, foeId: string): void {
  const hero = ctx.state.units[heroId]
  const foe = ctx.state.units[foeId]
  if (!hero || !foe) return
  fightUnits(ctx.state, hero, foe)
}
