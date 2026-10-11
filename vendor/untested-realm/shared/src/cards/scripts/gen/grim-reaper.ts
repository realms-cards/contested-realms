import { registerScript } from '../registry'
import { pushLog, removeUnitFromRealm } from '../../../engine/effects'
import { cemeteryProtected } from '../../../engine/statics'
import { shuffleWithSeed } from '../../../engine/rng'

// ---------- killer tracking ----------

// 'Whenever Grim Reaper kills a minion, banish that minion and all copies.
//  Search its owner's cemetery, hand, and spellbook and banish any copies. They shuffle.'
registerScript('Grim Reaper', {
  // FAQ: the victim is banished INSTEAD of dying (no deathrite), along with
  // all in-play copies (any controller), and all copies in the owner's
  // cemetery, hand and spellbook. They shuffle.
  onWouldDie: (state, selfId, dying) => {
    const reaper = state.units[selfId]
    if (!reaper || reaper.name !== 'Grim Reaper' || dying.isAvatar) return false
    const hit = state.flow?.lastHitBy
    if (!hit || hit.unitId !== dying.id || hit.attackerId !== selfId) return false
    const name = dying.name
    const owner = state.players[dying.owner]
    // the victim never reaches the cemetery
    if (removeUnitFromRealm(state, dying.id)) delete state.units[dying.id] // cargo stays (FAQ); avatars refuse removal
    if (!state.cards[dying.cardId]?.isToken) owner.banished.push(dying.cardId)
    // in-play copies, regardless of controller
    for (const u of Object.values(state.units)) {
      if (u.name === name && !u.isAvatar) {
        if (removeUnitFromRealm(state, u.id)) delete state.units[u.id]
        const card = state.cards[u.cardId]
        if (card && !card.isToken) state.players[card.owner].banished.push(card.id)
      }
    }
    // the owner's zones (Wormelow Tump can seal the cemetery)
    const sealed = cemeteryProtected(state, dying.owner, reaper.controller)
    let reaped = 0
    for (const zone of (sealed ? [owner.hand, owner.spellbook] : [owner.cemetery, owner.hand, owner.spellbook]) as string[][]) {
      for (let i = zone.length - 1; i >= 0; i--) {
        if (state.cards[zone[i]]?.name === name) {
          owner.banished.push(zone.splice(i, 1)[0])
          reaped++
        }
      }
    }
    state.seed = shuffleWithSeed(owner.spellbook, state.seed)
    pushLog(state, reaper.controller, `The Grim Reaper erases ${name} from existence (${reaped} more cop${reaped === 1 ? 'y' : 'ies'} reaped).`)
    return true
  },
})
