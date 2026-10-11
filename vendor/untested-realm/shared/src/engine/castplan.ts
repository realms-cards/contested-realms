// The GUI's cast-INITIATION decision, extracted as a pure function so it can be
// (a) shared by the client's clickHandCard and (b) exercised headlessly by the
// playability auditor — the two stay in lockstep, so an audit pass means the GUI
// genuinely lets you start that card.
//
// This encodes ONLY "which flow does clicking this hand card begin?" — the exact
// branch clickHandCard takes. Completing the flow (picking a legal square/target/
// direction) is engine-legality-driven and identical for client and audit.

import type { GameState, PlayerId } from './types'
import { getCard } from '../cards/db'
import { getScript } from '../cards/scripts/registry'
import { canCast, spellMorphName } from './casting'

export type CastPlan =
  | { kind: 'blocked'; reason: string }        // canCast refuses — the GUI won't start it
  | { kind: 'site' }                           // play a site: needs a board square
  | { kind: 'siteOrSpell'; morph: string }     // fire site castable as a Fireball (Avatar of Fire)
  | { kind: 'summon' }                         // minion: needs a summon square (+ region)
  | { kind: 'conjure' }                        // artifact: a site square, or a unit to carry it
  | { kind: 'aura' }                           // aura: needs a placement square/edge
  | { kind: 'projectile' }                     // magic: needs a cast-time direction
  | { kind: 'chaosTwister' }                   // magic: target + origin + blow direction
  | { kind: 'targets'; specCount: number }     // magic: needs N declared targets
  | { kind: 'cast' }                           // magic with no targets: cast immediately

/** Mirror of clickHandCard: given a hand card, what flow does the GUI begin? */
export function planCast(state: GameState, player: PlayerId, cardId: string, casterId: string): CastPlan {
  const card = state.cards[cardId]
  if (!card) return { kind: 'blocked', reason: 'no such card' }
  const def = getCard(card.name)
  const avatar = state.units[casterId]

  if (def.type === 'Site') {
    const morph = spellMorphName(state, player, card.name)
    if (morph && canCast(state, player, cardId, casterId).ok && avatar && !avatar.tapped) {
      return { kind: 'siteOrSpell', morph }
    }
    return { kind: 'site' }
  }

  const chk = canCast(state, player, cardId, casterId)
  if (!chk.ok) return { kind: 'blocked', reason: chk.reason ?? 'cannot cast' }

  if (def.type === 'Minion') return { kind: 'summon' }
  if (def.type === 'Artifact') return { kind: 'conjure' }
  if (def.type === 'Aura') return { kind: 'aura' }
  if (def.type === 'Magic') {
    const script = getScript(card.name)
    if (card.name === 'Chaos Twister') return { kind: 'chaosTwister' }
    if (script?.shootsProjectile) return { kind: 'projectile' }
    const specs = script?.targets ?? []
    if (specs.length === 0) return { kind: 'cast' }
    return { kind: 'targets', specCount: specs.reduce((a, s) => a + s.count, 0) }
  }
  return { kind: 'blocked', reason: `unhandled type ${def.type}` }
}
