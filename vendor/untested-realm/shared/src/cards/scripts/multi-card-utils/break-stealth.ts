import type { AbilityDef, EffectAPI } from '../registry'
import type { UnitState } from '../../../engine/types'

/** "Break Stealth → <effect>" (Asmodeus, Frozen Horror, Aria Wraith): usable only WHILE the minion has
 *  Stealth — the mark is the cost. Activating any ability already breaks Stealth in the engine (Codex —
 *  Stealth: interacting with the realm), so the effect must NOT re-check self.stealth: it is already
 *  false when the effect runs, which is exactly the cost paid. */
export function breakStealthAbility(key: string, label: string, effect: (ctx: EffectAPI, self: UnitState) => void): AbilityDef {
  return {
    key,
    label: `Break Stealth → ${label}`,
    cost: {},
    available: (state, sourceId) => !!state.units[sourceId]?.stealth,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (self) effect(ctx, self)
    },
  }
}
