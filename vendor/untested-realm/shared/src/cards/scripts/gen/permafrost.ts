import { registerScript } from '../registry'
import { notePermafrostHold, type HibernalFreeze, type PermafrostHold } from '../../../engine/statics'

// 'Disable effects on minions here are permanent, but are removed if they leave.'
// FAQ: it "replaces the normal end condition for disable effects with 'until it leaves'" — a Slumbering
// Giantess here doesn't wake when hurt, and wakes as she leaves. A minion disabled here (by anything) is
// held disabled while it stays (statics: flow.permafrostHolds — recorded the moment a disable lands on it,
// as it arrives here disabled, and by checkStateBased for every other source). When a minion leaves this
// location, every disable on it ends: its disable modifiers, a Hibernal Legion's freeze, the disabled state
// a card left on it (asleep, bound, cocooned…) and the hold. An area disable (Basilisk, Man-made Ice Age)
// that still covers its new location disables it there anew.
registerScript('Permafrost', {
  keepsDisables: true,
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    const u = ctx.state.units[moved.id]
    if (!self || !u || u.isAvatar) return
    const here = (p: { x: number; y: number }) => p.x === self.x && p.y === self.y
    if (here(u) && !here(from)) return notePermafrostHold(ctx.state, u) // arrived disabled: held from now on
    if (!here(from) || here(u)) return
    // it left: its disable effects are removed
    const flow = ctx.state.flow ?? {}
    const holds = (flow.permafrostHolds ?? []) as PermafrostHold[]
    const freezes = (flow.hibernalFreezes ?? []) as HibernalFreeze[]
    const had = holds.some((h) => h.unitId === u.id) || !!u.disabled || u.modifiers.some((m) => m.keyword === 'disabled')
      || freezes.some((f) => f.unitIds.includes(u.id))
    if (!had) return
    if (holds.length) flow.permafrostHolds = holds.filter((h) => h.unitId !== u.id)
    u.modifiers = u.modifiers.filter((m) => m.keyword !== 'disabled')
    for (const f of freezes) f.unitIds = f.unitIds.filter((id) => id !== u.id)
    if (u.disabled) {
      u.disabled = undefined
      if (u.counters) delete u.counters.asleep
    }
    ctx.log(`${u.name} thaws as it leaves ${self.name}.`)
  },
})
