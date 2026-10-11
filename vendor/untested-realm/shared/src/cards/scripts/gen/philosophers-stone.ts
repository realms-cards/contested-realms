import { registerScript } from '../registry'
import { getCard } from '../../db'

// (Maddening Bells scripted in m26, with a proper Spellcaster check.)

// 'The first spell of each element cast by the bearer each turn costs ① less.'
registerScript("Philosopher's Stone", {
  costModifier: (state, sourceId, caster, cardName) => {
    const art = state.artifacts[sourceId]
    if (!art || art.carriedBy !== caster.id) return 0
    const def = getCard(cardName)
    const elements = def.elements.map((e) => e.toLowerCase())
    if (!elements.length) return 0
    const seen: string[] = (state.flow?.philosopherSeen?.[caster.id] ?? [])
    return elements.some((e) => !seen.includes(e)) ? -1 : 0
  },
  onSpellCast: (ctx, by, cardName) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art?.carriedBy) return
    const def = getCard(cardName)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.philosopherSeen = ctx.state.flow.philosopherSeen ?? {}
    const list: string[] = ctx.state.flow.philosopherSeen[art.carriedBy] ?? []
    for (const e of def.elements.map((x) => x.toLowerCase())) {
      if (!list.includes(e)) list.push(e)
    }
    ctx.state.flow.philosopherSeen[art.carriedBy] = list
  },
  startOfTurn: (ctx) => {
    if (ctx.state.flow?.philosopherSeen) ctx.state.flow.philosopherSeen = {}
  },
})
