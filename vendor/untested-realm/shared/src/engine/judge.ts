// Judge tools: manual state adjustments for resolving non-automated card text.
// Deliberately permissive — it's the tabletop escape hatch, and every use is
// logged with the acting player's name.

import { findCard, getKeywords } from '../cards/db'
import type { GameState, JudgeOp, PlayerId, UnitState } from './types'
import {
  pushLog,
  dealDamageToUnit,
  healUnit,
  killUnit,
  banishUnit,
  bounceUnit,
  drawCards,
  summonToken,
  destroySite,
  checkStateBased,
  newId,
  makeCtx,
  wardUnit,
  toCemetery,
} from './effects'
import { avatarOf, inBounds, siteAt, squareLabel } from './grid'
import { terrainAt } from './statics'
import { syncCarried, detachFromCarrier } from './carrying'
import { getScript } from '../cards/scripts/registry'

export function applyJudge(state: GameState, player: PlayerId, op: JudgeOp): string | null {
  const who = state.players[player].name
  const j = (msg: string) => pushLog(state, player, `⚖ ${who}: ${msg}`)

  switch (op.k) {
    case 'life': {
      const avatar = avatarOf(state, op.player)
      avatar.life = Math.max(0, (avatar.life ?? 0) + op.delta)
      if (avatar.life === 0 && !avatar.deathsDoor) {
        avatar.deathsDoor = true
        avatar.doorTurn = state.turn
      }
      if (avatar.life! > 0) avatar.deathsDoor = false
      j(`${state.players[op.player].name} life ${op.delta > 0 ? '+' : ''}${op.delta} (now ${avatar.life})`)
      return null
    }
    case 'mana':
      state.players[op.player].mana = Math.max(0, state.players[op.player].mana + op.delta)
      j(`${state.players[op.player].name} mana ${op.delta > 0 ? '+' : ''}${op.delta}`)
      return null
    case 'damage': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      j(`${op.amount} damage to ${u.name}`)
      dealDamageToUnit(state, u, op.amount, player)
      return null
    }
    case 'heal': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      healUnit(state, op.unitId, op.amount)
      j(`healed ${u.name} by ${op.amount}`)
      return null
    }
    case 'kill': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      if (u.isAvatar) return 'Avatars cannot be killed directly.'
      j(`killed ${u.name}`)
      killUnit(state, op.unitId)
      return null
    }
    case 'banish': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      if (u.isAvatar) return 'Avatars cannot be banished.'
      j(`banished ${u.name}`)
      banishUnit(state, op.unitId)
      return null
    }
    case 'bounce': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      if (u.isAvatar) return 'Avatars cannot be bounced.'
      j(`returned ${u.name} to hand`)
      bounceUnit(state, op.unitId)
      return null
    }
    case 'move': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      if (!inBounds(op.x, op.y)) return 'Out of bounds.'
      u.x = op.x
      u.y = op.y
      u.region = op.region
      if (u.carriedBy) detachFromCarrier(state, u)
      syncCarried(state, u)
      j(`moved ${u.name} to ${squareLabel(op.x, op.y)} ${op.region}`)
      checkStateBased(state)
      return null
    }
    case 'moveArtifact': {
      const art = state.artifacts[op.artifactId]
      if (!art) return 'No such artifact.'
      if (!inBounds(op.x, op.y)) return 'Out of bounds.'
      // drop it off any bearer, then plant it on the ground at the chosen square
      if (art.carriedBy) {
        const carrier = state.units[art.carriedBy]
        if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
        art.carriedBy = null
      }
      art.x = op.x
      art.y = op.y
      art.region = op.region
      j(`moved ${art.name} to ${squareLabel(op.x, op.y)} ${op.region}`)
      checkStateBased(state)
      return null
    }
    case 'setAvatar': {
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      if (def.type !== 'Avatar') return `${op.name} is not an avatar.`
      const avatar = avatarOf(state, op.player)
      const from = avatar.name
      avatar.name = op.name
      const card = state.cards[avatar.cardId]
      if (card) card.name = op.name
      j(`${state.players[op.player].name}'s avatar changed from ${from} to ${op.name}`)
      checkStateBased(state)
      return null
    }
    case 'tap': {
      const obj = state.units[op.id] ?? state.sites[op.id] ?? state.artifacts[op.id]
      if (!obj) return 'No such card.'
      obj.tapped = op.tapped
      j(`${op.tapped ? 'tapped' : 'untapped'} ${obj.name}`)
      return null
    }
    case 'power': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      u.modifiers.push({ kind: 'power', amount: op.amount, duration: op.duration, turn: state.turn, sourcePlayer: player })
      j(`${u.name} power ${op.amount > 0 ? '+' : ''}${op.amount} (${op.duration})`)
      checkStateBased(state)
      return null
    }
    case 'keyword': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      u.modifiers.push({ kind: 'keyword', keyword: op.keyword, duration: op.duration, turn: state.turn, sourcePlayer: player, remove: op.remove || undefined })
      j(`${u.name} ${op.remove ? 'loses' : 'gains'} ${op.keyword} (${op.duration})`)
      checkStateBased(state)
      return null
    }
    case 'disable': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      u.disabled = op.on || undefined
      j(`${u.name} ${op.on ? 'disabled' : 'enabled'}`)
      return null
    }
    case 'setController': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      if (u.isAvatar) return "An avatar's controller can't be changed."
      u.controller = op.player
      j(`${u.name} is now controlled by ${state.players[op.player].name}`)
      checkStateBased(state)
      return null
    }
    case 'setArtifactController': {
      // A ground artifact's controller IS its conjurer (a carried one follows its bearer, so it must be
      // grounded first). Flip the conjurer — the Barricade and other Monuments then help the new owner.
      const art = state.artifacts[op.artifactId]
      if (!art) return 'No such artifact.'
      if (art.carriedBy) return 'A carried artifact is controlled by its bearer — drop it first.'
      art.conjuredBy = op.player
      j(`${art.name} is now controlled by ${state.players[op.player].name}`)
      checkStateBased(state)
      return null
    }
    case 'silence': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      if (u.isAvatar) return 'Avatars cannot be silenced.'
      u.silenced = op.on || undefined
      j(`${u.name} ${op.on ? 'silenced' : 'unsilenced'}`)
      return null
    }
    case 'summonSick': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      if (u.isAvatar) return 'Avatars never have summoning sickness.'
      // sickness = "entered this turn"; set enteredTurn to this turn to add it, or a
      // prior turn to clear it (a card with Charge still ignores it either way).
      u.enteredTurn = op.on ? state.turn : state.turn - 1
      j(`${u.name} ${op.on ? 'now has' : 'no longer has'} summoning sickness`)
      return null
    }
    case 'stealth': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      u.stealth = op.on || undefined
      j(`${u.name} ${op.on ? 'gains' : 'loses'} Stealth`)
      return null
    }
    case 'ward': {
      const u = state.units[op.unitId]
      if (!u) return 'No such unit.'
      // the judge is a rules escape hatch, but warding an Evil minion is
      // impossible per the rulebook — route the ON case through wardUnit so the
      // refusal is logged; the OFF case stays a direct clear.
      if (op.on) {
        if (wardUnit(state, u)) j(`${u.name} gains Ward`)
      } else {
        u.ward = undefined
        j(`${u.name} loses Ward`)
      }
      return null
    }
    case 'draw':
      j(`${state.players[op.player].name} draws from ${op.deck}`)
      drawCards(state, op.player, op.deck)
      return null
    case 'token': {
      if (!findCard(op.name)) return `Unknown card: ${op.name}`
      if (!inBounds(op.x, op.y)) return 'Out of bounds.'
      j(`summoned ${op.name} token`)
      summonToken(state, op.name, op.player, op.x, op.y, op.region)
      return null
    }
    case 'destroySite': {
      const s = state.sites[op.siteId]
      if (!s) return 'No such site.'
      if (op.toBanish) {
        // editor "remove completely": the site leaves the game (no cemetery, no
        // rubble) and the square is cleared. Bypasses indestructible/ward guards.
        const card = state.cards[s.cardId]
        delete state.sites[op.siteId]
        if (card && !card.isToken) state.players[card.owner].banished.push(card.id)
        j(`removed ${s.name} from the game`)
      } else {
        j(`destroyed ${s.name}`)
        destroySite(state, op.siteId, player)
      }
      checkStateBased(state)
      return null
    }
    case 'replaceSite': {
      // Swap a site for another site in the SAME square, keeping the same controller — an atomic
      // "destroy this site + place that one here" (no rubble, no cemetery; the old card leaves the
      // game like "remove completely"). The editor's one-click site swap.
      const s = state.sites[op.siteId]
      if (!s) return 'No such site.'
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      if (def.type !== 'Site') return `${op.name} is not a site.`
      const { x, y } = s
      const holder = (s.controller ?? s.owner ?? player) as PlayerId
      // remove the old site outright (banish its real card, like the editor's "remove completely")
      const oldCard = state.cards[s.cardId]
      delete state.sites[op.siteId]
      if (oldCard && !oldCard.isToken) state.players[oldCard.owner].banished.push(oldCard.id)
      // materialize the new site in the same spot, controlled by whoever held the old one
      const isRubble = op.name === 'Rubble'
      const cardId = newId(state, 'c')
      state.cards[cardId] = { id: cardId, name: op.name, owner: holder, ...(isRubble ? { isToken: true } : {}) }
      const siteId = newId(state, 's')
      state.sites[siteId] = {
        id: siteId, cardId, name: op.name, owner: holder,
        controller: isRubble ? null : holder, x, y, tapped: false, isRubble,
        ward: isRubble ? undefined : getKeywords(def.name).ward || undefined,
      }
      j(`replaced ${s.name} with ${op.name} at ${squareLabel(x, y)}`)
      checkStateBased(state)
      return null
    }
    case 'siteWard': {
      const s = state.sites[op.siteId]
      if (!s) return 'No such site.'
      s.ward = op.on || undefined
      j(`${s.name} ${op.on ? 'gains' : 'loses'} Ward`)
      return null
    }
    case 'flood': {
      const s = state.sites[op.siteId]
      if (!s) return 'No such site.'
      s.flooded = op.on || undefined
      j(`${s.name} ${op.on ? 'flooded' : 'drained'}`)
      checkStateBased(state)
      return null
    }
    case 'summonUnit': {
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      if (def.type !== 'Minion' && def.type !== 'Avatar') return `${op.name} is not a minion.`
      if (!inBounds(op.x, op.y)) return 'Out of bounds.'
      const kw = getKeywords(def.name)
      const cardId = newId(state, 'c')
      state.cards[cardId] = { id: cardId, name: op.name, owner: op.player }
      const unitId = newId(state, 'u')
      const unit: UnitState = {
        id: unitId,
        cardId,
        name: op.name,
        owner: op.player,
        controller: op.player,
        isAvatar: false,
        x: op.x,
        y: op.y,
        region: op.region,
        tapped: false,
        damage: 0,
        enteredTurn: state.turn,
        modifiers: [],
        carrying: [],
        carryingUnits: [],
        usedThisTurn: {},
        stealth: kw.stealth || undefined,
        ward: kw.ward || undefined,
      }
      state.units[unitId] = unit
      // Fire the unit's Genesis so its self-setup runs (Yog-Sothoth occupying every square,
      // oversized/aura footprints, etc.) — an editor summon should produce a fully-realized
      // unit, not a bare head that only exists at its summon square. `noGenesis` opts out for
      // the old raw-materialize behaviour (a bare head, no self-setup).
      if (!op.noGenesis) {
        const genesis = getScript(op.name)?.genesis
        if (genesis && state.units[unitId]) genesis(makeCtx(state, unitId, op.player, []))
      }
      j(`summoned ${op.name} at ${squareLabel(op.x, op.y)} ${op.region}`)
      checkStateBased(state)
      return null
    }
    case 'placeSite': {
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      if (def.type !== 'Site') return `${op.name} is not a site.`
      if (!inBounds(op.x, op.y)) return 'Out of bounds.'
      // Rubble may be replaced; a live (non-rubble) site blocks the square.
      const existing = siteAt(state, op.x, op.y)
      if (existing) {
        if (existing.isRubble) delete state.sites[existing.id]
        else return 'A site already occupies that square.'
      }
      // placing the 'Rubble' token makes a REAL rubble: controlled by no one and flagged
      // isRubble (so it provides nothing, is replaceable, and never reads as owned terrain).
      const isRubble = op.name === 'Rubble'
      const cardId = newId(state, 'c')
      state.cards[cardId] = { id: cardId, name: op.name, owner: op.player, ...(isRubble ? { isToken: true } : {}) }
      const siteId = newId(state, 's')
      state.sites[siteId] = {
        id: siteId,
        cardId,
        name: op.name,
        owner: op.player,
        controller: isRubble ? null : op.player,
        x: op.x,
        y: op.y,
        tapped: false,
        isRubble,
        // printed Ward enters with the site (Blessed Well, Pilgrim's Shrine...) — rubble has none
        ward: isRubble ? undefined : getKeywords(def.name).ward || undefined,
      }
      j(`placed ${op.name} at ${squareLabel(op.x, op.y)}`)
      checkStateBased(state)
      return null
    }
    case 'spawnArtifact': {
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      if (def.type !== 'Artifact') return `${op.name} is not an artifact.`
      const holder = op.giveTo ? state.units[op.giveTo] : null
      if (op.giveTo && !holder) return 'No such unit.'
      if (!holder && !inBounds(op.x, op.y)) return 'Out of bounds.'
      const cardId = newId(state, 'c')
      state.cards[cardId] = { id: cardId, name: op.name, owner: op.player }
      const artId = newId(state, 'a')
      state.artifacts[artId] = {
        id: artId,
        cardId,
        name: op.name,
        conjuredBy: op.player,
        x: holder ? holder.x : op.x,
        y: holder ? holder.y : op.y,
        region: holder ? holder.region : 'surface',
        carriedBy: holder ? holder.id : null,
        tapped: false,
      }
      if (holder) holder.carrying.push(artId)
      j(holder ? `gave ${op.name} to ${holder.name}` : `spawned ${op.name} at ${squareLabel(op.x, op.y)}`)
      checkStateBased(state)
      return null
    }
    case 'addToHand': {
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      const cardId = newId(state, 'c')
      state.cards[cardId] = { id: cardId, name: op.name, owner: op.player }
      state.players[op.player].hand.push(cardId)
      j(`added ${op.name} to ${state.players[op.player].name}'s hand`)
      return null
    }
    case 'discard': {
      const card = state.cards[op.cardId]
      if (!card) return 'No such card.'
      const p = state.players.find((pl) => pl.hand.includes(op.cardId))
      if (!p) return 'That card is not in a hand.'
      p.hand.splice(p.hand.indexOf(op.cardId), 1)
      toCemetery(state, op.cardId) // honor Mismanaged Mortuary / Kor Crematory routing
      j(`discarded ${card.name} from ${p.name}'s hand`)
      return null
    }
    case 'addToCemetery': {
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      const cardId = newId(state, 'c')
      state.cards[cardId] = { id: cardId, name: op.name, owner: op.player }
      state.players[op.player].cemetery.push(cardId)
      j(`added ${op.name} to ${state.players[op.player].name}'s cemetery`)
      return null
    }
    case 'addToCollection': {
      const def = findCard(op.name)
      if (!def) return `Unknown card: ${op.name}`
      // the collection is a card-name → copies pool (not physical card instances)
      const p = state.players[op.player]
      p.collection = { ...p.collection, [op.name]: (p.collection?.[op.name] ?? 0) + 1 }
      j(`added ${op.name} to ${p.name}'s collection (now ${p.collection[op.name]})`)
      return null
    }
    case 'removeArtifact': {
      const art = state.artifacts[op.artifactId]
      if (!art) return 'No such artifact.'
      if (op.toBanish) {
        // "remove completely": leaves the game (banished), not the cemetery
        if (art.carriedBy) {
          const carrier = state.units[art.carriedBy]
          if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
        }
        const card = state.cards[art.cardId]
        delete state.artifacts[op.artifactId]
        if (card && !card.isToken) state.players[card.owner].banished.push(card.id)
        j(`removed ${art.name} from the game`)
      } else {
        j(`sent ${art.name} to the cemetery`)
        // reuse the engine break path so carried lists / cemetery stay consistent
        makeCtx(state, art.id, player, []).breakArtifact(op.artifactId)
      }
      checkStateBased(state)
      return null
    }
    case 'removeAura': {
      const aura = state.auras[op.auraId]
      if (!aura) return 'No such aura.'
      const card = state.cards[aura.cardId]
      // an aura currently ANIMATED as a minion (Enchantress) shares its card with that unit;
      // checkStateBased routes the card once the aura is gone — don't also move it here.
      const animated = Object.values(state.units).some((u) => String(u.counters?.animatedAura ?? '') === aura.id)
      delete state.auras[op.auraId]
      if (op.toBanish) {
        if (card && !card.isToken && !animated) state.players[card.owner].banished.push(card.id)
        j(`removed ${aura.name} from the game`)
      } else {
        if (card && !card.isToken && !animated) toCemetery(state, card.id)
        j(`sent ${aura.name} to the cemetery`)
      }
      checkStateBased(state)
      return null
    }
    case 'setLife': {
      const avatar = avatarOf(state, op.player)
      avatar.life = Math.max(0, op.value)
      if (avatar.life === 0 && !avatar.deathsDoor) {
        avatar.deathsDoor = true
        avatar.doorTurn = state.turn
      }
      if (avatar.life > 0) avatar.deathsDoor = false
      j(`${state.players[op.player].name} life set to ${avatar.life}`)
      return null
    }
    case 'setMana': {
      state.players[op.player].mana = Math.max(0, op.value)
      j(`${state.players[op.player].name} mana set to ${state.players[op.player].mana}`)
      return null
    }
    case 'threshold': {
      state.flow = state.flow ?? {}
      state.flow.judgeThresh = state.flow.judgeThresh ?? {}
      const cur = state.flow.judgeThresh[op.player] ?? { air: 0, earth: 0, fire: 0, water: 0 }
      cur[op.element] = (cur[op.element] ?? 0) + op.delta
      state.flow.judgeThresh[op.player] = cur
      j(`${state.players[op.player].name} ${op.element} threshold ${op.delta > 0 ? '+' : ''}${op.delta} (override now ${cur[op.element] >= 0 ? '+' : ''}${cur[op.element]})`)
      return null
    }
    case 'untap': {
      let n = 0
      for (const u of Object.values(state.units)) if (u.controller === op.player && u.tapped) { u.tapped = false; n++ }
      for (const s of Object.values(state.sites)) if (s.controller === op.player && s.tapped) { s.tapped = false; n++ }
      for (const a of Object.values(state.artifacts)) {
        const controller = a.carriedBy ? state.units[a.carriedBy]?.controller ?? a.conjuredBy : a.conjuredBy
        if (controller === op.player && a.tapped) { a.tapped = false; n++ }
      }
      j(`untapped all of ${state.players[op.player].name}'s cards (${n})`)
      return null
    }
    case 'setArt': {
      const c = state.cards[op.cardId]
      if (!c) return 'No such card.'
      if (op.slug) c.art = op.slug
      else delete c.art
      j(`changed ${c.name}'s art`)
      return null
    }
    case 'setRegion': {
      // bury / submerge / surface a minion or artifact in place. Going below GRANTS the enabling keyword
      // (Burrowing under land, Submerge under water) so a plain minion actually stays there instead of being
      // banished by state-based checks. Artifacts sit below freely (no keyword needed).
      const u = state.units[op.id]
      const art = u ? undefined : (state.artifacts as any)[op.id]
      const obj: any = u ?? art
      if (!obj) return 'No such card.'
      if (u?.isAvatar) return "An avatar can't be buried."
      // a CARRIED artifact sent below is detached from its bearer — it can't ride a surface carrier
      // while itself buried, so it becomes a loose subsurface artifact in place.
      if (art?.carriedBy && op.region !== 'surface') {
        const bearer = state.units[art.carriedBy]
        if (bearer) bearer.carrying = bearer.carrying.filter((id: string) => id !== art.id)
        art.carriedBy = null
      }
      if (op.region !== 'surface') {
        if (!siteAt(state, obj.x, obj.y)) return 'Nothing here to go beneath.'
        if (u) {
          const kw = op.region === 'underwater' ? 'submerge' : 'burrowing'
          if (!u.modifiers.some((m) => m.kind === 'keyword' && m.keyword === kw && !m.remove)) {
            u.modifiers.push({ kind: 'keyword', keyword: kw, duration: 'permanent', turn: state.turn, sourcePlayer: player })
          }
        }
      }
      obj.region = op.region
      if (u) syncCarried(state, u)
      checkStateBased(state)
      j(`${obj.name} → ${op.region}`)
      return null
    }
    default:
      return 'Unknown judge operation.'
  }
}
