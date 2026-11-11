import { registerScript } from '../registry'

// 'Ranged 3, Stealth / Lethal while Stealthed.'
// A Stealth mark "is lost after the minion interacts with the realm" (rulebook): the shot or attack that
/// breaks it is still a stealthed one, so it is Lethal (breakStealth records it; the grace ends with that
// fight or shot — combat.ts endStealthGrace).
registerScript('The White Death', {
  selfKeywords: (state, self) => (self.stealth || self.counters?.stealthInteractedTurn === state.turn ? ['lethal'] : []),
})
