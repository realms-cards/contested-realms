import { registerScript } from '../registry'
import { pushLog, removeUnitFromRealm } from '../../../engine/effects'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import { shuffleDeck } from '../../../engine/knowledge'
import type { PlayerId } from '../../../engine/types'

// ---------- killer tracking ----------

// 'Whenever Grim Reaper kills a minion, banish that minion and all copies.
//  Search its owner's cemetery, hand, and spellbook and banish any copies. They shuffle.'
registerScript('Grim Reaper', {
  // FAQ: the victim is banished INSTEAD of dying (no deathrite), along with
  // all in-play copies (any controller), and all copies in the owner's
  // cemetery, hand and spellbook. They shuffle.
  killReplacementOutlivesSelf: true,
  onWouldDie: (state, selfId, dying) => {
    const live = state.units[selfId]
    if ((live && live.name !== 'Grim Reaper') || dying.isAvatar) return false
    // "kills" = the Reaper damaged the victim in its fatal event (the kill credit). The credit holds a
    // snapshot, so a Reaper that fell in the same simultaneous strike (a Lethal trade) still reaps.
    const credit = ((state.flow?.damageCredit?.[dying.id] ?? []) as { id: string; controller: PlayerId }[]).find((d) => d.id === selfId)
    if (!credit) return false
    const reaper = { controller: live?.controller ?? credit.controller }
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
    let sealed = cemeteryProtected(state, dying.owner, reaper.controller)
    // reaping cemetery copies is access → Bureau of Occult Control toll, only if a copy lies there
    if (!sealed && owner.cemetery.some((id) => state.cards[id]?.name === name) && !payZoneToll(state, reaper.controller)) {
      pushLog(state, reaper.controller, 'The Bureau of Occult Control demands (2) for cemetery access.')
      sealed = true
    }
    let reaped = 0
    for (const zone of (sealed ? [owner.hand, owner.spellbook] : [owner.cemetery, owner.hand, owner.spellbook]) as string[][]) {
      for (let i = zone.length - 1; i >= 0; i--) {
        if (state.cards[zone[i]]?.name === name) {
          owner.banished.push(zone.splice(i, 1)[0])
          reaped++
        }
      }
    }
    shuffleDeck(state, owner.id, 'spellbook')
    pushLog(state, reaper.controller, `The Grim Reaper erases ${name} from existence (${reaped} more cop${reaped === 1 ? 'y' : 'ies'} reaped).`)
    return true
  },
})
