import { registerScript } from '../registry'
import { affinity } from '../../../engine/casting'
import { pushLog } from '../../../engine/effects'

// "(A)(A)(A) – Genesis → This turn, gains Spellcaster and its next magic costs (3) less."
// The "(A)(A)(A)" gate is an AFFINITY requirement (3 Air), so it must read true affinity — which
// includes avatar/temp/judge bonuses (Elementalist, Desert Bloom, …) — not just the printed Air on
// the sites you control. Re-summing printed thresholds silently under-counted and the genesis did
// nothing when your third Air came from a bonus.
registerScript("Merlin's Tower", {
  genesis: (ctx) => {
    if (affinity(ctx.state, ctx.controller).air < 3) return
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    // "gains Spellcaster" THIS TURN — the tower itself becomes a legal caster (resolveCaster synthesises
    // a Spellcaster at the site while this marker holds), so you can cast a magic THROUGH it.
    flow.spellcasterSites = [...(flow.spellcasterSites ?? []), { siteId: ctx.sourceId, turn: ctx.state.turn }]
    // "its next magic costs ③ less" — tied to the TOWER as caster (casterId), so only a spell cast BY
    // the tower gets the discount, not an unrelated magic your avatar casts.
    flow.spellDiscounts = [
      ...(flow.spellDiscounts ?? []),
      { player: ctx.controller, turn: ctx.state.turn, amount: 3, elements: null, casterId: ctx.sourceId },
    ]
    pushLog(ctx.state, ctx.controller, "Merlin's Tower awakens — it becomes a Spellcaster and its next magic costs ③ less this turn.")
  },
})
