import { registerScript } from '../registry'
import { effAttack, effDefence, isUnmodifiable } from '../../../engine/statics'
import type { GameState, UnitState } from '../../../engine/types'

// 'Bearer minion takes no damage from units with 4 or more power, and is also a Faerie.'
// Only a MINION bearer gets either (not an Avatar), and one that can't be modified (Monks of Kobalsa)
// can gain neither the ability nor the type (Codex Can't Be Modified).
const knotApplies = (state: GameState, unit: UnitState) => !unit.isAvatar && !isUnmodifiable(state, unit)

registerScript('Fourberie Knot', {
  // "…and is also a Faerie": grant the Faerie subtype to the bearer DYNAMICALLY, so every
  // subtype-gated effect that reads effSubtypes (A Midsummer Night's Dream's power boost + dispel
  // check, Seelie/Unseelie Court, Fae City…) sees the bearer as a real Faerie. effSubtypes gates this
  // on the artifact not being silenced, so a silenced Knot stops granting it automatically.
  subtypeOverride: (state, selfId, unit, subtypes) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== unit.id || !knotApplies(state, unit)) return subtypes
    return subtypes.includes('Faerie') ? subtypes : [...subtypes, 'Faerie']
  },
  damagePreventer: true,
  bearerOnlyPreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    // a striker, or a unit dealing damage with its ability (Draconian Bonekite, Vikings)
    const dealer = source?.attackerId ?? source?.sourceUnitId
    if (!art || art.carriedBy !== victim.id || !dealer || !knotApplies(state, victim)) return amount
    const striker = state.units[dealer]
    if (!striker) return amount
    const avg = Math.floor((effAttack(state, striker) + effDefence(state, striker)) / 2)
    return avg >= 4 ? 0 : amount
  },
})
