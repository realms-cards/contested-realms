import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, wardUnit } from '../../../engine/effects'

// ---------------------------------------------------- Book of Blessings ----
// 'Whenever bearer casts magic that chooses a single allied minion, Ward that ally.'
registerScript('Book of Blessings', {
  onSpellCast: (ctx, by, cardName, casterId, targets) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || !art.carriedBy || art.carriedBy !== casterId) return
    if (getCard(cardName).type !== 'Magic') return
    const unitRefs = (targets ?? []).filter((t): t is { unit: string } => 'unit' in t)
    if (unitRefs.length !== 1) return
    const ally = ctx.state.units[unitRefs[0].unit]
    if (!ally || ally.isAvatar || ally.controller !== by) return
    if (wardUnit(ctx.state, ally)) pushLog(ctx.state, by, `Book of Blessings wards ${ally.name}.`)
  },
})
