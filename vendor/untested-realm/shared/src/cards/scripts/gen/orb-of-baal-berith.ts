import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW } from '../../../engine/grid'
import { resolveCaster } from '../../../engine/casting'

// 'The first time each turn a Magic spell is cast nearby, Orb of Ba'al Berith
//  creates a copy. The spell's controller may choose new targets.'
// An unpickable Monument: what matters is where the SPELLCASTER stands — any caster (avatar, minion,
// spellcaster artifact or site, either player's) nearby the Orb. FAQ: the Orb is the copy's spellcaster,
// the original spell's controller controls it, X stays the same and no additional cost is paid again.
// The copy is queued and cast once the original has resolved (resolveQueuedCopyCasts).
registerScript("Orb of Ba'al Berith", {
  onSpellCast: (ctx, by, cardName, casterId) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || getCard(cardName).type !== 'Magic' || !casterId) return
    // the copy the Orb itself casts is a Magic cast nearby too — the once-per-turn claim stops a loop
    if (art.counters?.copiedTurn === ctx.state.turn) return
    const caster = resolveCaster(ctx.state, casterId, by, casterId === art.id)
    if (!caster || !nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === caster.x && s.y === caster.y)) return
    art.counters = { ...art.counters, copiedTurn: ctx.state.turn }
    const flow = ctx.state.flow!
    flow.copyCastQueue = [...(flow.copyCastQueue ?? []), { player: by, name: cardName, casterId: art.id, turn: ctx.state.turn }]
  },
})
