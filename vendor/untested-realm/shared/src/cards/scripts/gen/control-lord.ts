import type { EffectAPI } from '../registry'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'
import { isDisabled } from '../../../engine/statics'
import { takeControl } from '../multi-card-utils/take-control'

// Shared machinery for the continuous "you control all X" lords — King of the Realm ("all Mortals"),
// Returned King ("all Undead"), Pied Piper of Hameln ("all minions with 1 or less power"). They are
// UNIFORM: each claims every matching enemy minion while it's in play and un-hushed, and its court
// reverts to each minion's previous controller when the lord LEAVES the realm (flow.kingsCourt in
// removeUnitFromRealm) OR is SILENCED/DISABLED (releaseControlWhenHushed, in checkStateBased).
export type LordMatch = (state: GameState, u: UnitState) => boolean

// claim one matching enemy minion, recording the return-to (its current controller) keyed by lord id
function claim(state: GameState, u: UnitState, controller: PlayerId, lordId: string): void {
  state.flow = state.flow ?? {}
  state.flow.kingsCourt = [...(state.flow.kingsCourt ?? []), { unitId: u.id, back: u.controller, by: lordId }]
  takeControl(state, u, controller)
}

// a silenced/disabled (or absent) lord exerts NO control — it claims nothing here, and its existing
// court is released centrally by checkStateBased. Otherwise sweep and claim every match not already ours.
function active(state: GameState, lordId: string): boolean {
  const lord = state.units[lordId]
  return !!lord && !lord.silenced && !isDisabled(state, lord)
}

export function controlLordSweep(state: GameState, lordId: string, controller: PlayerId, matches: LordMatch): void {
  if (!active(state, lordId)) return
  for (const u of Object.values(state.units)) {
    if (u.isAvatar || u.id === lordId || u.controller === controller) continue
    if (matches(state, u)) claim(state, u, controller, lordId)
  }
}

export function controlLordOnEnter(state: GameState, lordId: string, controller: PlayerId, entered: UnitState, matches: LordMatch): void {
  if (!active(state, lordId)) return
  if (!entered.isAvatar && entered.id !== lordId && entered.controller !== controller && matches(state, entered)) {
    claim(state, entered, controller, lordId)
  }
}

// the shared script fields every continuous-control lord registers (spread into registerScript,
// alongside any card-specific statics like grantsPower). Claims on entry (genesis), re-establishes
// every turn (startOfTurn — also how it re-grabs after an un-hush or a power change), and grabs any
// matching entrant (onUnitEnters). releaseControlWhenHushed wires the silence/disable revert.
export function controlLordScript(matches: LordMatch) {
  return {
    releaseControlWhenHushed: true as const,
    genesis: (ctx: EffectAPI) => controlLordSweep(ctx.state, ctx.sourceId, ctx.controller, matches),
    startOfTurn: (ctx: EffectAPI) => controlLordSweep(ctx.state, ctx.sourceId, ctx.controller, matches),
    onUnitEnters: (ctx: EffectAPI, entered: UnitState) => controlLordOnEnter(ctx.state, ctx.sourceId, ctx.controller, entered, matches),
  }
}
