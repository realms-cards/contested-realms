"use strict";

import type { AnyRecord, MatchPatch } from "../types";

/**
 * Legacy auto-combat function - now disabled.
 *
 * This function previously detected mixed-ownership tiles and auto-resolved
 * combat on every permanents patch. It has been replaced by the explicit
 * combat flow (declareAttack → commitDefenders → autoResolveCombat) which
 * handles all combat logging and resolution on the client side.
 *
 * The function signature is preserved for compatibility with match-leader.ts.
 */
export function applyMovementAndCombat(
  _prevGame: AnyRecord,
  _action: MatchPatch,
  _playerId: string,
  _context?: AnyRecord
): MatchPatch | null {
  return null;
}
