import { registerScript, type EffectAPI } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { hasSubtype, isDisabled, silenceImmune } from '../../../engine/statics'
import { pushLog, checkStateBased, killUnit } from '../../../engine/effects'

// 'Stealth / May be cast to any Mortal, silencing then killing them, without
// breaking Stealth.'
registerScript('Jack the Ripper', {
  summonAnywhere: true,
  genesis: (ctx) => {
    let self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // FAQ (Jack the Ripper): the "silence then kill" is placed on the storyline when he is
    // CAST and resolves as he enters. Continuous statics apply the instant he enters — BEFORE
    // his storyline kill resolves — so settle them now, while the target Mortal is still alive.
    // This matters because that Mortal may itself be Jack's silencer (e.g. Sister Stefánia,
    // "other nearby minions are silenced"): being silenced/disabled on entry breaks his Stealth
    // (checkStateBased) even though he then kills the silencer and the silence lifts.
    checkStateBased(ctx.state)
    self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // Disabled on entry → he cannot take the effect-granted kill action, so no one dies (he
    // still entered and is now revealed). Silenced is fine — a silenced minion may still kill.
    if (isDisabled(ctx.state, self)) return
    // he is cast ONTO a Mortal; if several share the square, the killer chooses the victim
    const prey = unitsAt(ctx.state, self.x, self.y, self.region)
      .filter((u) => u.id !== self.id && !u.isAvatar && hasSubtype(ctx.state, u, 'Mortal'))
      .map((u) => u.id)
    if (prey.length === 0) return
    if (prey.length === 1) return ripperSlay(ctx, prey[0])
    ctx.ask({ kind: 'chooseTargets', title: 'Jack the Ripper: silence and slay which Mortal?', data: { candidates: prey, count: 1, upTo: false, kind: 'unit' } }, 'ripper')
  },
  conts: {
    ripper: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') ripperSlay(ctx, id)
    },
  },
})

function ripperSlay(ctx: EffectAPI, id: string) {
  const prey = ctx.state.units[id]
  if (!prey || prey.isAvatar) return
  // a prey that "can't be silenced" keeps its death triggers — Jack still slays, but can't hush it.
  if (!silenceImmune(ctx.state, prey)) prey.silenced = true
  killUnit(ctx.state, prey.id)
  pushLog(ctx.state, ctx.controller, `${prey.name} never saw the blade.`)
}
