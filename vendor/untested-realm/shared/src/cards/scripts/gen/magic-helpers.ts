// Shared helpers for magic spell card scripts (no registerScript — skipped by gen:card-index).

import { type EffectAPI } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { effectSummonUnit } from '../../../engine/effects'

// after the (possibly Lucky-bent) minion is chosen, pick where to summon it (FAQ: anywhere)
export function raiseAsk(ctx: EffectAPI, pick: string): void {
  ctx.log(`Fate chooses ${ctx.state.cards[pick].name}...`)
  ctx.ask({ kind: 'chooseSquare', title: `Summon ${ctx.state.cards[pick].name} where?`, data: {} }, 'rise', { pick })
}

// the chosen unit takes 4; every OTHER unit at that same location takes 2
export function fireballHit(ctx: EffectAPI, id: string) {
  const impact = ctx.state.units[id]
  if (!impact) return
  const { x, y, region } = impact
  const others = unitsAt(ctx.state, x, y, region).filter((u) => u.id !== impact.id).map((u) => u.id)
  ctx.dealDamage({ unit: impact.id }, 4)
  for (const oid of others) if (ctx.state.units[oid]) ctx.dealDamage({ unit: oid }, 2)
}
