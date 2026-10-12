import { registerScript, type DamageSource } from '../registry'
import type { GameState } from '../../../engine/types'
import { nearbySquaresW } from '../../../engine/grid'

// 'Damage caused by nearby units is increased to 2.' — applies to ANY damage a
// nearby unit deals, whether the victim is a unit or a site.
function panpipesBoost(state: GameState, selfId: string, amount: number, source: DamageSource | undefined): number {
  if (!source?.attackerId) return amount
  const art = state.artifacts[selfId]
  const striker = state.units[source.attackerId]
  if (!art || !striker) return amount
  // boost a 0- or 1-damage hit to 2 (incl. a 0-power strike); a fully-prevented/negative hit is left alone
  if (amount >= 0 && amount < 2 && nearbySquaresW(state, art.x, art.y).some((s) => s.x === striker.x && s.y === striker.y)) {
    return 2
  }
  return amount
}

registerScript('Panpipes of Pnom', {
  // an INCREASE: runs in the damage pre-pass so it resolves BEFORE any shell/prevention (Tufted
  // Turtles) — a boosted hit is what the shell then prevents, per "increase, then would-take-damage".
  damageBoost: (state, selfId, _victim, amount, source) => panpipesBoost(state, selfId, amount, source),
  siteDamageModifier: (state, selfId, _site, n, source) => panpipesBoost(state, selfId, n, source),
})
