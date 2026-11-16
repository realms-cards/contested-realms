import { registerScript, type EffectAPI, type TargetSpec } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'
import { validateTarget } from '../../../engine/casting'

// 'At the end of your turn, strike target adjacent minion for D6 damage.'
// A targeted pick (Stealth hides an enemy, an enemy's Ward breaks instead — the chooseTargets prompt does
// that) of any minion, ally or enemy, adjacent in the Trolls' own region (adjacent includes its own square).
// No "may": if one exists, one is struck — the Trolls themselves when nothing else is adjacent (FAQ). The
// target is chosen first and the D6 rolled as the ability resolves (FAQ), through the luck layer (Lucky
// Charm / Kythera / Black Cat); the Trolls strike it for that much — a real strike
// (Lance, Lethal, strike triggers), its damage the roll instead of their power.
const SPEC: TargetSpec = { what: 'minion', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent minion' }

function rollAndStrike(ctx: EffectAPI, targetId: string): void {
  const roll = ctx.lucky([1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), payload: n })), 'roll', 'options', { targetId })
  if (roll !== undefined) tussle(ctx, targetId, roll as number)
}

function tussle(ctx: EffectAPI, targetId: string, roll: number): void {
  const self = ctx.state.units[ctx.sourceId]
  const victim = ctx.state.units[targetId]
  pushLog(ctx.state, ctx.controller, `🎲 D6: ${roll}`)
  if (!self || !victim) return
  ctx.strike(self, { unit: victim.id }, roll)
}

registerScript("Tusslin' Trolls", {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const candidates = Object.values(ctx.state.units)
      .filter((u) => validateTarget(ctx.state, SPEC, { unit: u.id }, self, ctx.controller, undefined, self.name) === null)
      .map((u) => u.id)
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: "Tusslin' Trolls — strike which adjacent minion for D6?", data: { candidates, count: 1, upTo: false, kind: 'unit' } }, 'tussle')
  },
  conts: {
    tussle: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      // a warded enemy pick comes back empty: its Ward broke instead
      if (typeof id !== 'string' || !ctx.state.units[id]) return
      rollAndStrike(ctx, id)
    },
    roll: (ctx, c, choice) => tussle(ctx, c.targetId as string, (c.__opts as number[])[luckyChoiceIndex(c, choice)]),
  },
})
