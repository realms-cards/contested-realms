import { registerScript, getScript, type EffectAPI, type AbilityDef } from '../registry'
import { getCard, getKeywords } from '../../db'
import { pushLog, makeCtx, noAtlasDraw, drawCards } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'
import { playSite, legalSiteSquares } from '../../../engine/casting'
import { effKeywords, artifactSilenced } from '../../../engine/statics'
import type { GameState, PlayerId } from '../../../engine/types'
// distinct source card-names Vivien copies triggered/activated abilities from among UNITS in
// play: every Avatar, and every (printed or granted) Spellcaster minion. Never another Vivien.
function vivienUnitSourceNames(state: GameState): Set<string> {
  const names = new Set<string>()
  for (const u of Object.values(state.units)) {
    // exclude EVERY Vivien by name (FAQ 3: never copy another Vivien) — that also covers the
    // acting Vivien herself, so this works whether she is a realm unit or a card in a cemetery.
    if (u.silenced || u.name === 'Vivien the Enchantress') continue
    if (u.isAvatar || effKeywords(state, u).spellcaster) names.add(u.name)
  }
  return names
}

function vivienSiteResolve(ctx: EffectAPI, choice: string) {
  if (choice === 'Draw a site') return void drawCards(ctx.state, ctx.controller, 'atlas')
  const p = ctx.state.players[ctx.controller]
  const names = [...new Set(p.hand.filter((id) => getCard(ctx.state.cards[id].name).type === 'Site').map((id) => ctx.state.cards[id].name))]
  if (!names.length) return
  if (names.length === 1) return vivienSitePick(ctx, names[0])
  ctx.ask({ kind: 'nameCard', title: 'Play which site?', data: { names } }, 'vivienPickSite')
}

function vivienSitePick(ctx: EffectAPI, name: string) {
  const squares = legalSiteSquares(ctx.state, ctx.controller, name)
  const cardId = ctx.state.players[ctx.controller].hand.find((id) => ctx.state.cards[id].name === name)
  if (!cardId) return
  if (!squares.length) return ctx.log('No legal square for that site.')
  if (squares.length === 1) return void playSite(ctx.state, ctx.controller, cardId, squares[0].x, squares[0].y)
  ctx.ask({ kind: 'chooseSquare', title: `Play ${name} where?`, data: { squares } }, 'vivienPlaceSite', { cardId })
}

// Vivien has her sources' TRIGGERED abilities too — not only their activated ones and the
// Omphalos-style turn-step draws (start/endOfTurn, handled below). These actor-side event hooks
// fire on the acting player's own action, so we re-run each source's hook anchored on Vivien
// (controller = hers): e.g. copying an Enchantress lets Vivien animate one of HER auras when SHE
// casts a spell — the reported gap. No double-fire: the source unit's own emitEvent call still
// runs for ITS controller, and these hooks guard on `by === ctx.controller`, so Vivien's copy only
// acts on Vivien's actions and the source only on its own. Dedup by source card name (Vivien has
// each printed ability once, regardless of how many copies of the source are in play).
function vivienForwardTrigger(ctx: EffectAPI, hook: 'onSpellCast' | 'onSitePlayed' | 'onCardDrawn' | 'onAnyDeath', args: any[], cemeteryOnly = false) {
  // Vivien acts "wherever she is": as a UNIT in the realm, OR as a CARD in a cemetery. In the
  // cemetery her copied cemetery-abilities operate on HER card — e.g. a realm Bone Rabble made a
  // Spellcaster grants "whenever you play an earth site, summon THIS from your cemetery", so playing
  // an earth site offers to revive Vivien from the cemetery as she were Bone Rabble. We anchor each
  // forwarded source hook on Vivien's unit id (realm) or her cemetery card id (cemetery).
  const self = ctx.state.units[ctx.sourceId]
  if (self) {
    // reactive death hooks (onAnyDeath) are forwarded ONLY from the cemetery — anchoring them on a
    // realm Vivien risks double-firing a source's "when a minion dies…" effect. From the cemetery
    // the only cemetery-summon hooks fire, and they self-check cemetery membership, so it's safe.
    if (cemeteryOnly) return
    if (self.silenced) return
  } else if (!ctx.state.players.some((pl) => pl.cemetery.includes(ctx.sourceId))) {
    return // not a realm unit and not in a cemetery → nothing to do (hand/spellbook: no usable trigger)
  }
  const anchorId = self ? self.id : ctx.sourceId
  const done = new Set<string>()
  for (const name of vivienUnitSourceNames(ctx.state)) {
    // From the cemetery, only CEMETERY-NATIVE event triggers are copied (Bone Rabble / Scourge
    // Zombies — listensFromCemetery, which self-check cemetery membership). A board-interacting
    // trigger like the Enchantress's animate-an-aura needs Vivien in the realm, so it is NOT
    // forwarded from the cemetery ("can't target auras or anything else").
    if (!self && !getScript(name)?.listensFromCemetery) continue
    const fn = (getScript(name) as any)?.[hook]
    if (fn && !done.has(name)) {
      done.add(name)
      // meta.name = the SOURCE's card name so any ctx.ask registers its continuation under the
      // SOURCE's script (`script:Bone Rabble:rattle`), while sourceId stays Vivien so self-references
      // ("summon THIS from the cemetery") resolve to HER card.
      fn(makeCtx(ctx.state, anchorId, ctx.controller, [], undefined, undefined, { kind: 'effect', name }), ...args)
    }
  }
}

// Vivien copies the zone-scoped ACTIVATED abilities of realm Avatars/Spellcasters too — the ones a
// card offers while it sits in hand (Moon Clan Werewolf), cemetery (Grigori Rasputin) or spellbook
// (The Inquisition). Each is re-emitted with cardId = VIVIEN's card in that zone, so "summon THIS"
// self-references resolve to her; contOwner routes the continuations to the source's own script.
function vivienZoneAbilities(state: GameState, cardId: string, owner: PlayerId, hook: 'handAbilities' | 'cemeteryAbilities' | 'spellbookAbilities'): AbilityDef[] {
  const out: AbilityDef[] = []
  for (const name of vivienUnitSourceNames(state)) {
    const fn = (getScript(name) as any)?.[hook] as ((s: GameState, c: string, o: PlayerId) => AbilityDef[]) | undefined
    if (!fn) continue
    for (const a of fn(state, cardId, owner)) out.push({ ...a, label: `${a.label} (${name})`, contOwner: a.contOwner ?? name })
  }
  return out
}

// Vivien's copy of an avatar's NATIVE "Tap → Play or draw a site" action (not a scripted
// ability, so it must be synthesised). Present whenever a standard-action avatar is in the
// realm. Resolves entirely through prompts routed to Vivien's own conts (contOwner).
const VIVIEN_SITE_ABILITY: AbilityDef = {
  key: 'vivienSite',
  label: '⟳ Tap → Play or draw a site (Avatar)',
  cost: { tap: true },
  contOwner: 'Vivien the Enchantress',
  effect: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const hasSite = p.hand.some((id) => getCard(ctx.state.cards[id].name).type === 'Site')
    const canDraw = !noAtlasDraw(ctx.state, ctx.controller) && p.atlas.length > 0
    const options: string[] = []
    if (hasSite) options.push('Play a site')
    if (canDraw) options.push('Draw a site')
    if (!options.length) return ctx.log('No site to play and no atlas to draw from.')
    if (options.length === 1) return vivienSiteResolve(ctx, options[0])
    ctx.ask({ kind: 'chooseOption', title: 'Play or draw a site?', data: { options } }, 'vivienSiteChoice')
  },
}

// ---------------------------------------------------- Vivien the Enchantress ----
// 'Vivien has the other printed abilities of all Avatars and Spellcasters in the realm.'
registerScript('Vivien the Enchantress', {
  // Vivien is a Spellcaster ONLY while a real Spellcaster (not an avatar) is in the realm — she
  // must "gain the Spellcaster ability another way" (FAQ). If only element-locked spellcasters
  // are present she inherits the UNION of their elements; a single unrestricted spellcaster lets
  // her cast anything. Recomputed live, so she loses it the instant that spellcaster leaves or
  // stops being one. She never counts another Vivien (FAQ) or an avatar.
  selfKeywords: (state, self) => {
    if (self.silenced) return []
    let unrestricted = false
    let any = false
    const els = new Set<string>()
    const consider = (kw: ReturnType<typeof effKeywords> | undefined) => {
      if (!kw?.spellcaster) return
      any = true
      if (kw.spellcasterElements?.length) kw.spellcasterElements.forEach((e) => els.add(e))
      else if (kw.spellcasterElement) els.add(kw.spellcasterElement)
      else unrestricted = true
    }
    for (const u of Object.values(state.units)) {
      if (u.id === self.id || u.isAvatar || u.name === 'Vivien the Enchantress') continue
      consider(effKeywords(state, u, new Set([self.id]))) // seed `seen` with self → no Vivien recursion
    }
    for (const a of Object.values(state.artifacts)) {
      if (!artifactSilenced(state, a)) consider(getKeywords(a.name)) // the Omphaloi
    }
    if (!any) return []
    if (unrestricted || els.size === 0) return ['spellcaster']
    return [`spellcaster:${[...els].join(',')}`]
  },
  // Copies the ACTIVATED abilities of every Avatar and Spellcaster in the realm — units in play,
  // spellcaster ARTIFACTS (Omphaloi), and spellcasters that act from a cemetery — plus the
  // avatar's native site action. Never another Vivien. Abilities activate ON Vivien (ctx.sourceId
  // = her), so self-references resolve to her.
  grantsAbilities: (state, selfId, unit): AbilityDef[] => {
    if (unit.id !== selfId) return []
    const out: AbilityDef[] = []
    const add = (name: string, fromCemetery = false) => {
      if (name === 'Vivien the Enchantress') return // never copy another Vivien (FAQ)
      for (const a of getScript(name)?.abilities ?? []) {
        if (out.some((b) => b.key === a.key)) continue
        // Ghost Vivien — activating an ability Vivien copied from a CEMETERY spellcaster
        const base = a.effect
        const effect = fromCemetery && base
          ? (ctx: EffectAPI) => { awardAchievement(ctx.state, 'ghost-vivien', ctx.controller); return base(ctx) }
          : base
        out.push({ ...a, label: `${a.label} (${name})`, contOwner: a.contOwner ?? name, effect })
      }
    }
    for (const u of Object.values(state.units)) {
      if (u.id === selfId || u.silenced) continue
      if (!u.isAvatar && !effKeywords(state, u).spellcaster) continue
      add(u.name)
    }
    for (const a of Object.values(state.artifacts)) {
      if (!artifactSilenced(state, a) && getKeywords(a.name).spellcaster) add(a.name)
    }
    for (const p of state.players) {
      const seen = new Set<string>()
      for (const cid of p.cemetery) {
        const nm = state.cards[cid]?.name
        if (!nm || seen.has(nm)) continue
        seen.add(nm)
        if (getScript(nm)?.listensFromCemetery && getKeywords(nm).spellcaster) add(nm, true)
      }
    }
    // the avatar's native "Tap → play or draw a site" (synthesised, not a scripted ability)
    if (Object.values(state.units).some((u) => u.isAvatar && !getScript(u.name)?.noStandardSiteAction)) out.push(VIVIEN_SITE_ABILITY)
    return out
  },
  // Vivien also fires her sources' TRIGGERED abilities, anchored on HERSELF (self-references →
  // Vivien). An Omphalos-style end-of-turn draw locks the spell to VIVIEN — she may cast it, and
  // its minions must summon at HER square (separate from the Omphalos's own draw). Unit-source
  // hooks are re-run with sourceId = Vivien (safe: they read state.units[sourceId] = her).
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) {
      // from the cemetery she fires only LOCATION-INDEPENDENT source end-of-turn triggers; the
      // Omphalos-style draw below needs her realm square, so it is skipped here.
      if (!ctx.state.players.some((pl) => pl.cemetery.includes(ctx.sourceId))) return
      const cemDone = new Set<string>()
      for (const name of vivienUnitSourceNames(ctx.state)) {
        if (!getScript(name)?.turnTriggersFromCemetery) continue
        const hook = getScript(name)?.endOfTurn
        if (hook && !cemDone.has(name)) { cemDone.add(name); hook(makeCtx(ctx.state, ctx.sourceId, ctx.controller, [])) }
      }
      return
    }
    if (self.silenced) return
    const p = ctx.state.players[ctx.controller]
    const done = new Set<string>()
    for (const a of Object.values(ctx.state.artifacts)) {
      if (artifactSilenced(ctx.state, a) || !getKeywords(a.name).spellcaster) continue
      if (!getScript(a.name)?.endOfTurn || done.has(a.name)) continue // artifact spellcaster with an end-of-turn draw (Omphaloi)
      done.add(a.name)
      const top = p.spellbook.shift()
      if (top === undefined) continue
      p.hand.push(top)
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.lockedCards = [...(ctx.state.flow.lockedCards ?? []), { cardId: top, casterId: self.id, casterName: self.name, grantsCasting: false }]
      pushLog(ctx.state, ctx.controller, 'Vivien draws a spell — only she may cast it.')
      if (getCard(ctx.state.cards[top].name).type === 'Minion') {
        ctx.state.flow.castAtOnly = [...(ctx.state.flow.castAtOnly ?? []).filter((c: any) => c.cardId !== top), { cardId: top, x: self.x, y: self.y }]
      }
    }
    for (const name of vivienUnitSourceNames(ctx.state)) {
      const hook = getScript(name)?.endOfTurn
      if (hook && !done.has(name)) { done.add(name); hook(makeCtx(ctx.state, self.id, ctx.controller, [])) }
    }
  },
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const cem = !self && ctx.state.players.some((pl) => pl.cemetery.includes(ctx.sourceId))
    if (!self && !cem) return
    if (self?.silenced) return
    const done = new Set<string>()
    for (const name of vivienUnitSourceNames(ctx.state)) {
      // from the cemetery she only fires LOCATION-INDEPENDENT turn triggers (Seer's deck peek)
      if (cem && !getScript(name)?.turnTriggersFromCemetery) continue
      const hook = getScript(name)?.startOfTurn
      if (hook && !done.has(name)) { done.add(name); hook(makeCtx(ctx.state, ctx.sourceId, ctx.controller, [])) }
    }
  },
  // "at the start of EACH player's turn" triggers of her sources (Crave Golem's hunt, etc.), anchored
  // on HER — she has the ability too, so she also acts (a second craving golem). Fires for the Vivien
  // unit only (the engine drives startOfEachTurn per realm unit), so no cemetery variant is needed.
  startOfEachTurn: (ctx, player) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.silenced) return
    const done = new Set<string>()
    for (const name of vivienUnitSourceNames(ctx.state)) {
      const hook = getScript(name)?.startOfEachTurn
      // meta.name = the SOURCE, so any prompt it raises (Crave Golem's lucky pick / hungry-step
      // choice) registers its continuation under the SOURCE's script, not Vivien's.
      if (hook && !done.has(name)) { done.add(name); hook(makeCtx(ctx.state, self.id, ctx.controller, [], undefined, undefined, { kind: 'effect', name }), player) }
    }
  },
  // actor-side triggered abilities of her sources (Enchantress "animate an aura when you cast",
  // and any spellcaster/avatar that reacts to YOUR cast / site play / draw), anchored on Vivien.
  // she keeps her abilities "wherever she is", so her actor-side triggers also fire while she sits
  // in a cemetery (letting a copied cemetery ability revive her — see vivienForwardTrigger).
  listensFromCemetery: true,
  onSpellCast: (ctx, ...args) => vivienForwardTrigger(ctx, 'onSpellCast', args),
  onSitePlayed: (ctx, ...args) => vivienForwardTrigger(ctx, 'onSitePlayed', args),
  onCardDrawn: (ctx, ...args) => vivienForwardTrigger(ctx, 'onCardDrawn', args),
  // reactive death triggers only from the cemetery — lets a Scourge-Zombies-style ability revive her.
  onAnyDeath: (ctx, ...args) => vivienForwardTrigger(ctx, 'onAnyDeath', args, true),
  // Genesis: when SHE enters, she fires the Genesis of every realm Avatar/Spellcaster (Apprentice
  // Wizard's draw, etc.), anchored on her — "the other printed abilities … wherever she is".
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.silenced) return
    for (const name of vivienUnitSourceNames(ctx.state)) {
      const g = getScript(name)?.genesis
      if (g) g(makeCtx(ctx.state, ctx.sourceId, ctx.controller, ctx.targets ?? [], undefined, undefined, { kind: 'effect', name }))
    }
  },
  // Deathrite: on HER death she fires each source's Deathrite (e.g. Nosferatu's "re-form underground"
  // — she then dies there unless another source lent her Burrowing, exactly as the card implies).
  deathrite: (ctx) => {
    for (const name of vivienUnitSourceNames(ctx.state)) {
      const d = getScript(name)?.deathrite
      if (d) d(makeCtx(ctx.state, ctx.sourceId, ctx.controller, [], undefined, undefined, { kind: 'effect', name }))
    }
  },
  // Zone-scoped activated abilities of realm sources, offered on HER card in that zone:
  handAbilities: (state, cardId, owner) => vivienZoneAbilities(state, cardId, owner, 'handAbilities'),
  cemeteryAbilities: (state, cardId, owner) => {
    const out = vivienZoneAbilities(state, cardId, owner, 'cemeteryAbilities')
    // + each realm source's LOCATION-INDEPENDENT activated abilities (Savior's ward), which don't
    //   need the activator on a square, so Vivien can use them straight from the cemetery.
    for (const name of vivienUnitSourceNames(state)) {
      for (const a of getScript(name)?.abilities ?? []) {
        if (a.usableFromCemetery) out.push({ ...a, key: `${a.key}:${cardId}`, label: `${a.label} (${name})`, contOwner: a.contOwner ?? name })
      }
    }
    return out
  },
  spellbookAbilities: (state, cardId, owner) => vivienZoneAbilities(state, cardId, owner, 'spellbookAbilities'),
  // Cast restrictions: she inherits each realm source's "where I can be cast" rule (Lugbog Cat's
  // "water sites only"), even when detrimental — every source's filter must pass.
  summonFilter: (state, player, at) => {
    for (const name of vivienUnitSourceNames(state)) {
      const f = getScript(name)?.summonFilter
      if (f) { const err = f(state, player, at); if (err) return err }
    }
    return null
  },
  conts: {
    vivienSiteChoice: (ctx, _c, choice) => { if (typeof choice === 'string') vivienSiteResolve(ctx, choice) },
    vivienPickSite: (ctx, _c, name) => { if (typeof name === 'string') vivienSitePick(ctx, name) },
    vivienPlaceSite: (ctx, contCtx, sq) => { if (sq && contCtx?.cardId) playSite(ctx.state, ctx.controller, contCtx.cardId, sq.x, sq.y) },
  },
})
