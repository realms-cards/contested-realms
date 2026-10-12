// Shared helpers for minion card scripts (no registerScript — skipped by gen:card-index).

import { effAttack, effDefence } from '../../../engine/statics'

export const alliedMinion = (state: any, carrier: any, target: any) =>
  target.controller === carrier.controller && !target.isAvatar

/** average of attack/defence, rounding down (split-power comparison rule) */
export function avgPower(state: any, u: any): number {
  return Math.floor((effAttack(state, u) + effDefence(state, u)) / 2)
}
