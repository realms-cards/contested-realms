import { registerScript } from '../registry'
import { effSubtypes, effKeywords } from '../../../engine/statics'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Bearer has Ranged and its strikes deal 1 more damage to units for each of the
//  following they are: Evil, artifact bearers, spellcasters, voidwalkers,
//  submergers, burrowers, and Frogs.'
registerScript('Peacemaker Arbalest', {
  bearerKeywords: ['ranged'],
  damageModifier: (state, selfId, victim, amount, source) => {
    if ((source?.kind !== 'strike' && source?.kind !== 'projectile') || !source.attackerId) return amount
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== source.attackerId || victim.isAvatar) return amount
    let bonus = 0
    if (isEvilU(state, victim)) bonus++
    if (victim.carrying.length) bonus++
    const kw = effKeywords(state, victim)
    if (kw.spellcaster) bonus++
    if (kw.voidwalk) bonus++
    if (kw.submerge) bonus++
    if (kw.burrowing) bonus++
    if (victim.name === 'Frog' || effSubtypes(state, victim).includes('Frog')) bonus++
    return amount + bonus
  },
})
