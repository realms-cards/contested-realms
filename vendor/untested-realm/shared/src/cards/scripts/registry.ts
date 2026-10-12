// Card script registry. A script teaches the engine what a card's rules text
// does. Cards whose text is only engine-native keywords need no script.

import type { GameState, UnitState, SiteState, AuraState, PlayerId, Thresholds, Region, Duration } from '../../engine/types'
import { scriptedNames, getCard } from '../db'

/** A reference to something an effect can point at. */
export type TargetRef =
  | { unit: string }
  | { site: string }
  | { artifact: string }
  | { aura: string }
  | { square: { x: number; y: number; region?: Region } }

/**
 * The fully-chosen cast parameters for a "printed area" damage spell, as
 * collected by the client (and mirrored from the engine's cont ctx). Every
 * field is optional — a given spell reads only the ones it needs. Directions
 * are cardinal ('n'|'s'|'e'|'w'); Flame Wave uses `edge` ('west'|'east').
 */
export interface AreaDamageParams {
  direction?: 'n' | 's' | 'e' | 'w'
  /** secondary direction (Burning Hands' second hand) */
  direction2?: 'n' | 's' | 'e' | 'w'
  /** Cone of Flame: which way the wide edge leans */
  lean?: 'left' | 'right'
  /** Flame Wave: the edge the wave starts from */
  edge?: 'west' | 'east'
  /** a chosen origin/target square (Major Explosion, Day of Judgment) */
  at?: { x: number; y: number }
  /** chosen site ids (Meteor Shower's three impacts, Craterize's ground zero) */
  sites?: string[]
}

export interface TargetSpec {
  what: 'unit' | 'minion' | 'avatar' | 'site' | 'artifact' | 'minionOrArtifact' | 'minionArtifactOrAura' | 'square'
  count: number
  /** may pick fewer than count (e.g. "up to two") */
  upTo?: boolean
  /** uses the "target" keyword → same-region + stealth/ward rules apply */
  targeted: boolean
  owner?: 'ally' | 'enemy' | 'any'
  /** spatial bound relative to the caster/source; default anywhere */
  where?: 'anywhere' | 'nearby' | 'adjacent' | 'here'
  /** anchor `where` to a PREVIOUSLY-picked target (by index) instead of the caster — e.g. Blink's square
   *  must be nearby the ALLY you selected (target 0), not the caster. */
  whereOf?: number
  /** extra predicate, receives the candidate unit/site */
  filter?: (state: GameState, candidate: any, source: UnitState) => boolean
  label?: string
}

export interface EffectAPI {
  state: GameState
  /** instance id of the source (unit / artifact / site / aura), '' for magics */
  sourceId: string
  /** the casting/controlling player */
  controller: PlayerId
  /** the spellcaster unit for spells */
  caster?: UnitState
  targets: TargetRef[]
  at?: { x: number; y: number; region?: Region }
  extra?: any
  // ---- helpers (bound in effects.ts) ----
  log(msg: string): void
  /** add mana to the controller AND float a "+n 🔮" over this source (Field Laborers, tap-for-mana) */
  gainMana(amount: number): void
  dealDamage(target: TargetRef, n: number): void
  /** Force pending deaths to resolve NOW, mid-effect. Damage within one effect is simultaneous —
   *  deaths settle only when the effect ends — so call this ONLY when the script must observe a kill
   *  it just dealt (Fire Harpoons' "pull it if it survived", a kill counter). Never for plain area
   *  damage, which relies on the deferral so an in-blast reducer keeps shielding the rest of the blast. */
  settleDeaths(): void
  strike(attacker: UnitState, target: TargetRef): void
  kill(unitId: string): void
  banish(unitId: string): void
  bounce(unitId: string): void
  heal(unitId: string, n: number): void
  gainLife(player: PlayerId, n: number): void
  loseLife(player: PlayerId, n: number): void
  draw(player: PlayerId, deck: 'spellbook' | 'atlas', n?: number): void
  /** "Draw a card"/"draw N cards": the player chooses spellbook-or-atlas per card (unlike
   *  draw(...,'spellbook') which is "draw a spell"). Prompts once per card; see askDrawCard. */
  drawCard(player: PlayerId, n?: number): void
  /** Pay a mana cost for a script effect (deducts mana AND records it as spent-this-turn so the
   *  mana widget's total stays put). Use instead of `players[p].mana -= n`. NOT for draining an
   *  opponent's mana (that's a loss of their total, which should show). */
  spendMana(player: PlayerId, n: number): void
  addPower(unitId: string, amount: number, duration: 'endOfTurn' | 'permanent'): void
  grantKeyword(unitId: string, keyword: string, duration: 'endOfTurn' | 'permanent'): void
  summonToken(name: string, owner: PlayerId, x: number, y: number, region?: Region): UnitState | null
  teleport(unitId: string, x: number, y: number, region?: Region, opts?: { push?: boolean; intoVoid?: boolean }): void
  tap(unitId: string): void
  untap(unitId: string): void
  /** `by` overrides who is credited with the destruction (Vindictive Nation, ward checks);
   *  defaults to the source's controller. Pass the attacker/damager for reactive shatters. */
  destroySite(siteId: string, by?: PlayerId, sacrifice?: boolean): void
  disable(unitId: string): void
  /** flood a site (permanent unless duration given) */
  floodSite(siteId: string, duration?: 'endOfTurn'): void
  /** send an artifact in play to its owner's cemetery ("break") */
  breakArtifact(artifactId: string): void
  /**
   * discard a random card from a player's hand. `spellsOnly` restricts the
   * candidate pool to spells (non-Site) BEFORE the random/Lucky Charm roll, for
   * texts that say "discard a random spell". Default (whole hand) matches
   * "discard a random card".
   */
  discardRandom(player: PlayerId, opts?: { spellsOnly?: boolean }): void
  /**
   * ask a player to discard from their hand (id-based resolution — the choice is
   * resolved to the card ids captured at ask time, never to a live hand index).
   * `spellsOnly` offers only spells (non-Site) for texts that say "discard a spell";
   * `filter(name)` narrows further (e.g. only sites, or only Fire cards).
   */
  discardChoose(player: PlayerId, opts?: { spellsOnly?: boolean; filter?: (name: string) => boolean; title?: string; pick?: number; upTo?: boolean }): void
  /** put the top N cards of a deck into the cemetery */
  mill(player: PlayerId, deck: 'spellbook' | 'atlas', n: number): void
  /** ask the acting player a follow-up question; effect continues in the script's `conts[contKey]` */
  ask(prompt: { kind: 'yesNo' | 'chooseOption' | 'chooseTargets' | 'chooseSquare' | 'chooseCards' | 'nameCard' | 'drawDeck' | 'sitePermutation'; title: string; data?: any; player?: PlayerId; spec?: TargetSpec }, contKey: string, ctx?: any): void
  /**
   * Resolve ONE random outcome for the controller, honoring Kythera/Black Cat (choose
   * any) and Lucky Charm (roll N+1, choose one). Returns the chosen `payload` when no
   * player choice is needed; otherwise pushes a prompt to the chooser and returns
   * `undefined` (the caller must return) — the effect finishes in `conts[contKey]`, which
   * recovers the payload via `ctx.__opts[luckyChoiceIndex(ctx, choice)]`.
   * `display:'cards'` shows card art; otherwise text options.
   */
  lucky(options: { label: string; payload: unknown }[], contKey: string, display?: 'cards' | 'options', ctxExtra?: Record<string, unknown>): unknown
}

export interface AbilityDef {
  key: string
  label: string
  cost: { tap?: boolean; mana?: number; sacrificeSelf?: boolean; life?: number; discardSpell?: boolean }
  threshold?: Partial<Thresholds>
  targets?: TargetSpec[]
  oncePerTurn?: boolean
  /** a oncePerTurn ability whose use is spent only when the effect COMMITS (the script sets usedThisTurn
   *  itself), not at activation — so the player can back out of intermediate prompts for free. */
  deferUse?: boolean
  /** where the choice of square is required (e.g. teleport destinations) */
  needsSquare?: boolean
  /** card name whose `conts` resolve this ability's asks — set when an ability
   *  is granted across scripts (The Pallid Bust, Vivien) */
  contOwner?: string
  /** when present and false, the ability is HIDDEN in the UI and rejected by
   *  canActivate — for abilities that only make sense in a specific state
   *  (Realm-Eater's Digest only when there is a devoured site to digest). */
  available?: (state: GameState, sourceId: string) => boolean
  /** dynamic button label that overrides `label` (e.g. appends a remaining
   *  count like "(2)"). Purely cosmetic — the client renders it. */
  dynamicLabel?: (state: GameState, sourceId: string) => string
  /** the ability does NOT need its activator to be a unit at a realm location — its effect
   *  touches only decks / life / hand / a chosen realm object, never the activator's own square
   *  (Savior wards any minion summoned this turn). Such abilities can be activated even from the
   *  cemetery, and Vivien-in-the-cemetery inherits them. Contrast Necromancer ("summon a Skeleton
   *  HERE") which needs the activator on a square. */
  usableFromCemetery?: boolean
  /** the ability flips its own card over (Druid → Bruin). A masked Imposter must
   *  NOT be offered it — flipping leaves it with no Avatar and it loses the game
   *  (FAQ), so Imposter filters flipsSelf abilities out of its granted set. */
  flipsSelf?: boolean
  /** treat this activation like a card PLAY online: hold it TENTATIVELY (only the actor sees it) until
   *  it actually does something, and leave no trace if it resolves to nothing (Animist's "cast a magic
   *  as a Spirit" — declined or cancelled → never broadcast/recorded to the opponent). See the server. */
  tentativePlay?: boolean
  effect: (ctx: EffectAPI) => void
}

export interface CardScript {
  /** cast-time targets for Magic spells (or genesis targets for permanents) */
  targets?: TargetSpec[]
  /**
   * This Magic shoots a projectile: it needs a cardinal direction chosen at
   * cast time (delivered as extra.direction). The client shows the direction
   * picker instead of casting immediately, and castSpell refuses to consume the
   * card until a direction is supplied.
   */
  shootsProjectile?: boolean
  /** An X-cost spell (Arcane Barrage) whose X is paid as mana DURING resolution, not as the printed
   *  cast cost (which is 0). A cost discount (Merlin's Tower "costs 3 less") would be wasted on that 0,
   *  so castSpell stashes any matched discount into flow.xCostDiscount for the spell to subtract from X. */
  xCostSpell?: boolean
  /** Magic resolution */
  onCast?: (ctx: EffectAPI) => void
  /** triggered when the card enters the realm (ANY entry: cast, reanimate,
   *  effect-summon, token, steal-into-play). Fired from BOTH the cast path
   *  (casting.ts) and the effect-entry path (effectSummonUnit in effects.ts). */
  genesis?: (ctx: EffectAPI) => void
  /** genesis needs cast-time targets too */
  genesisTargets?: TargetSpec[]
  /**
   * A CAST-ONLY rider that is NOT a Genesis ability: it fires only when the card
   * is actually CAST, right where the cast path fires genesis, and never when the
   * card enters the realm by an effect. Mephistopheles' avatar replacement is the
   * canonical case: "Must be cast to your Avatar's location, taking their life and
   * replacing them as your Avatar" — no Genesis marker, and the FAQ confirms "If
   * you manage to summon Mephistopheles without casting him, then he will not
   * replace your avatar" (faq_dump.md:1954). Keep true Genesis in `genesis`.
   */
  castRider?: (ctx: EffectAPI) => void
  /** triggered when the unit dies (before cemetery) */
  deathrite?: (ctx: EffectAPI) => void
  /** activated abilities beyond the basic ones */
  abilities?: AbilityDef[]
  /** start/end of controller's turn triggers */
  startOfTurn?: (ctx: EffectAPI) => void
  endOfTurn?: (ctx: EffectAPI) => void
  /** end of EVERY turn (either player's) */
  endOfEveryTurn?: (ctx: EffectAPI) => void
  /** artifact: "After each turn, return this to its owner's hand." Processed in the
   *  end-phase CLEANUP — AFTER minion damage is healed — so a minion kept alive by this
   *  artifact's power buff survives the turn (Torshammar Trinket FAQ). Doing it as an
   *  endOfEveryTurn instead strips the buff while the carrier is still damaged, killing it
   *  before the heal. */
  returnToHandAfterTurn?: boolean
  // ---- event triggers (self = the listening card in play) ----
  /** any unit died (fires after it left the realm; `dead` is a value snapshot) */
  onAnyDeath?: (ctx: EffectAPI, dead: UnitState) => void
  /** a unit entered the realm (summon/conjure/token/reanimate) */
  onUnitEnters?: (ctx: EffectAPI, entered: UnitState) => void
  /** a spell was cast by `by` (targets are the cast-time choices, if any) */
  onSpellCast?: (ctx: EffectAPI, by: PlayerId, cardName: string, casterId?: string, targets?: TargetRef[]) => void
  /** this unit was struck by `striker` (combat or projectile) */
  onSelfStruck?: (ctx: EffectAPI, striker: UnitState) => void
  /** this unit attacked and killed `victim` */
  onAttackKill?: (ctx: EffectAPI, victim: UnitState) => void
  /** artifact: keywords granted to the bearer (e.g. ['airborne']) */
  bearerKeywords?: string[]
  /** artifact: power bonus granted to the bearer (weapons) */
  bearerPower?: number
  /** static: keywords this unit grants to other units */
  grantsKeywords?: (state: GameState, self: UnitState, other: UnitState) => string[]
  /** static: power this unit grants to other units */
  grantsPower?: (state: GameState, self: UnitState, other: UnitState) => number
  /** PERF hint: this unit's grantsKeywords/grantsPower are STRUCTURALLY self-only — they return
   *  `[]`/`0` for every `other` that isn't the granter itself (Angel Ascendant "…while Warded",
   *  Grand Old Boar, Hyperparasite). Set true so the static-grant index can EXCLUDE it from the
   *  cross-unit scan (a self-only grant can never affect another unit; its own effect is applied
   *  via the direct self-evaluation in collectStaticGrants/powerModifiers). NEVER set this on a
   *  hook that can grant to others — that would silently drop the grant. */
  selfGrantOnly?: boolean
  /** continuous "you control all X" lord (Pied Piper): its claimed court (flow.kingsCourt entries
   *  keyed `by` = this unit) reverts the moment it is silenced or disabled, not only when it leaves
   *  the realm. Opt-in so a one-shot claimer that never re-sweeps isn't stranded. */
  releaseControlWhenHushed?: boolean
  /** aura statics */
  auraGrantsKeywords?: (state: GameState, self: AuraState, unit: UnitState) => string[]
  auraGrantsPower?: (state: GameState, self: AuraState, unit: UnitState) => number
  /** extra mana this site provides (beyond the standard 1) */
  siteExtraMana?: number
  /** extra mana a unit/artifact provides its controller each turn (e.g. Älvalinne Dryads) */
  extraManaEachTurn?: number | ((state: GameState, sourceId: string) => number)
  /** dynamic bearer power bonus (e.g. Excalibur, Crown of the Victor) */
  bearerPowerFn?: (state: GameState, artifactId: string, bearer: UnitState) => number
  /** this unit took damage (any source) */
  onSelfDamaged?: (ctx: EffectAPI, amount: number) => void
  /** Seirawan Hydra: "immediately heals from damage that doesn't kill it." Resolved by
   *  checkStateBased AFTER the lethal-damage check, so damage that would kill (6 at once, or
   *  simultaneous batched blows totalling its life) still kills, while non-lethal damage is wiped. */
  healsNonlethalDamage?: boolean
  /** gate: does this site currently provide mana/threshold? (e.g. Glastonbury Tor) */
  siteProvides?: (state: GameState, site: { id: string; x: number; y: number; controller: PlayerId | null }) => boolean
  /** unit atop a site suppresses that site's threshold (e.g. Granary Rats) */
  suppressSiteThreshold?: boolean
  /** unit can't be disabled (e.g. Gossamer Ghost, Iron Man Talus) */
  immuneToDisable?: boolean
  /** unit can't be immobilized — its Immobile keyword (printed or granted) is stripped, and area
   *  immobilizers (the Bog) don't hold it (e.g. Gossamer Ghost). Distinct from immuneToDisable:
   *  a card grants whichever of the two its own text names, never both-by-implication. */
  immuneToImmobilize?: boolean
  /** this unit's attacks can't be defended (e.g. Harassing Ruffians) */
  cantBeDefended?: boolean
  /** minion must be summoned at a position passing this check (e.g. Forsaken → outer column) */
  summonFilter?: (state: GameState, player: PlayerId, at: { x: number; y: number }) => string | null
  /** artifact static: keywords granted to units (e.g. Horn of Caerleon) */
  artifactGrantsKeywords?: (state: GameState, artifactId: string, unit: UnitState) => string[]
  /** enemies near this unit/site permanently lose Stealth ('nearby' | 'global') */
  stripStealth?: 'nearby' | 'global'
  /** units carried by this unit are disabled (e.g. Hyperparasite) */
  carriedAreDisabled?: boolean
  /** units carried by this unit can't be voluntarily set down (Brobdingnag Bullfrog's
   *  belly: swallowed until it leaves the realm) */
  carriedCantDrop?: boolean
  /** this unit can't drop artifacts (e.g. Lord of Greed) */
  unitCantDrop?: boolean
  /** this unit struck a site (e.g. Lord of Destruction) */
  onStrikeSite?: (ctx: EffectAPI, siteId: string) => void
  /** minion can't intercept (e.g. Lumbering Giant) */
  cantIntercept?: boolean
  /** unit can't attack sites (e.g. Monstrous Lion) */
  cantAttackSites?: boolean
  /** on a site: this site and surface minions here can't be attacked (Dome of Osiros) */
  siteBlocksAttacks?: boolean
  /** on an aura: covered sites and surface units atop them can't be attacked (Blizzard) */
  auraBlocksAttacks?: boolean
  /** on an aura: surface units atop covered sites can't be intercepted (Blizzard) */
  auraBlocksIntercepts?: boolean
  /** site may be played atop a site you own, bouncing it to your hand (Mirage) */
  mayReplaceOwnSite?: boolean
  /** on a site: grants a free (cost 0) step to a unit (Updraft Ridge) */
  siteFreeStep?: (state: GameState, site: { id: string; x: number; y: number }, unit: UnitState, from: Step, to: Step) => boolean
  /** artifact grants activated abilities to units (Battering Ram: units here) */
  artifactGrantsAbilities?: (state: GameState, artifactId: string, unit: UnitState) => AbilityDef[]
  /** aura grants activated abilities to units (Homecoming: minions here) */
  auraGrantsAbilities?: (state: GameState, aura: { id: string; squares: { x: number; y: number }[] }, unit: UnitState) => AbilityDef[]
  /** site grants activated abilities to units */
  siteGrantsAbilities?: (state: GameState, site: { id: string; x: number; y: number }, unit: UnitState) => AbilityDef[]
  /** This Site is a TRAP: it is played FACE-DOWN, disguised as the basic site of its single element
   *  (Spire/Valley/Wasteland/Stream), and masquerades as that basic site for every purpose until sprung.
   *  The framework (enterSite / viewFor / activateAbility) handles the disguise, the owner-only reveal
   *  so the opponent never receives the real card, and the "trap activates: …" reveal animation. */
  siteTrap?: boolean
  /** the trap's "spring" ability — surfaced to the CONTROLLER while the trap is face-down. Activating it
   *  reveals the true site (its name/threshold/passives come online) and fires `effect`; the site then
   *  stays in play as its real self. Cost / threshold / targets behave like any activated ability. */
  siteTrapAbility?: {
    label: string
    cost: AbilityDef['cost']
    threshold?: Partial<Thresholds>
    targets?: TargetSpec[]
    effect: (ctx: EffectAPI) => void
  }
  /** fires at the start of EVERY turn (any player); second arg is the player whose turn begins */
  startOfEachTurn?: (ctx: EffectAPI, activePlayer: PlayerId) => void
  /** on a site: anyone may summon (matching) minions here (Donnybrook Inn;
   *  Tournament Grounds restricts to Knights via the function form) */
  siteAllowsAnySummon?: boolean | ((state: GameState, site: { id: string; x: number; y: number }, player: PlayerId, cardName: string) => boolean)
  /** this card's own effective subtypes (Azuridge Caravan: all minion types) */
  selfSubtypes?: (state: GameState, self: UnitState, printed: string[]) => string[]
  /** modifies OTHER units' subtypes while this card is in play (Corruptor, Bower of Bliss) */
  subtypeOverride?: (state: GameState, selfId: string, unit: UnitState, subtypes: string[]) => string[]
  /** this card's own effective elements (Azuridge Caravan: all elements) */
  selfElements?: (state: GameState, self: UnitState, printed: string[]) => string[]
  /** continuous: this card (unit or site) silences the given unit while in play
   *  (Bower of Bliss, Sisters of Silence). Applied in checkStateBased. */
  silencesUnit?: (state: GameState, selfId: string, unit: UnitState) => boolean
  /** avatar setup rule: opening-hand draw counts (Spellslinger, Pathfinder) */
  setupDraw?: { spells?: number; sites?: number }
  /** avatar deck rule: the atlas may not contain duplicate cards (Pathfinder) */
  atlasNoDuplicates?: boolean
  /** avatar: fires after the avatar plays a site with its basic ability (Geomancer) */
  afterAvatarSitePlay?: (ctx: EffectAPI, siteId: string) => void
  /** keywords this card grants to ITSELF while a condition holds (Realm-Eater: immobile) */
  selfKeywords?: (state: GameState, self: UnitState) => string[]
  /** avatar: fires once during game setup, after avatars are placed (Harbinger) */
  onSetup?: (state: GameState, player: PlayerId) => void
  /** avatar: its controller may summon minions at this square regardless of site control (Harbinger) */
  allowsSummonAt?: (state: GameState, player: PlayerId, at: { x: number; y: number }) => boolean
  /** avatar: extra squares the controller can summon minions to (the ENUMERATION of
   *  allowsSummonAt). Lets canCast's cheapest-cost search see position discounts at
   *  non-site squares, so a minion only affordable with Harbinger's −1 isn't blocked. */
  extraSummonSquares?: (state: GameState, player: PlayerId) => { x: number; y: number }[]
  /** avatar deck rule: sites may go in the spellbook and the atlas stays empty (Magician) */
  sitesInSpellbook?: boolean
  /** avatar deck rule: decks may only contain Uniques, in exactly matching pairs (Duplicator) */
  pairsOfUniques?: boolean
  /** avatar: the basic tap ability cannot draw a site (Magician has no atlas) */
  noAtlasDraw?: boolean
  /** avatar: has NO standard "Tap → Play or draw a site" — it plays sites through a
   *  replacement ability instead (Pathfinder's topmost-site tap) */
  noStandardSiteAction?: boolean
  /** unit grants activated abilities to units — incl. possibly itself (Dragonlord's borrowed dragon) */
  grantsAbilities?: (state: GameState, selfId: string, unit: UnitState) => AbilityDef[]
  /** fires after this unit finishes resolving an attack it initiated and survived
   *  (Bladedancer, Captain Baldassare — target/site of the attack included) */
  afterAttack?: (ctx: EffectAPI, attacker: UnitState, targetUnitId?: string | null, siteId?: string | null) => void
  /** hand-card morph: cast this card from hand as a different spell (Avatar of Fire's Fireballs) */
  handSpellMorph?: (state: GameState, player: PlayerId, cardName: string) => string | null
  /** fires after this unit resolves a ranged strike that hit (Kite Archer) */
  afterRangedStrike?: (ctx: EffectAPI, self: UnitState) => void
  /** continuous: this unit disables `unit` while both are in the realm (Stone-gaze Gorgons) */
  disablesOther?: (state: GameState, selfId: string, unit: UnitState) => boolean
  /** the disable only bites a unit "AT REST" (Hillock Basilisk, Stone-gaze Gorgons): a unit that is
   *  currently resolving its own move/attack, or entering the realm (firing its Genesis), is not yet
   *  disabled — it finishes its action / Genesis first, then is disabled once it comes to rest. */
  disablesOnlyAtRest?: boolean
  /** carried artifact: its bearer is disabled (Iron Shackles) */
  bearerDisabled?: boolean
  /** artifact may be conjured onto an ENEMY minion (Iron Shackles) */
  conjureToEnemy?: boolean
  /** on an aura: its controller may summon (matching) minions to covered sites (Summoning Sphere, Crusade) */
  auraAllowsSummon?: (state: GameState, aura: { id: string; controller: PlayerId; squares: { x: number; y: number }[] }, player: PlayerId, cardName: string, at: { x: number; y: number }) => boolean
  /** on an aura: covered sites provide this much extra mana to their controller (Abundance) */
  auraSiteExtraMana?: number
  /** on a site: OTHER nearby sites are silenced (Smokestacks of Gnaak) */
  silencesNearbySites?: boolean
  /** on a site: silences specific other sites (Fields of Phyxis: directly in front) */
  silencesSiteAt?: (state: GameState, self: { id: string; x: number; y: number; controller: PlayerId | null }, target: { x: number; y: number }) => boolean
  /** on a site: provides its mana and threshold to BOTH players (Avalon) */
  providesForEveryone?: boolean
  /** on an artifact: the site it sits on is disabled — no mana/threshold/text (Blightstone) */
  disablesSite?: boolean
  /** on an aura: covered units are disabled (A Midsummer Night's Dream: Mortals) */
  auraDisablesUnit?: (state: GameState, aura: { id: string; squares: { x: number; y: number }[] }, unit: UnitState) => boolean
  /** a site was played; fires for all cards in play (Cursed Land, Boulevard of Bones) */
  onSitePlayed?: (ctx: EffectAPI, by: PlayerId, site: { id: string; x: number; y: number; name: string }) => void
  /** on a site: the first attack out of here each turn can't be defended (Dread Thicket) */
  siteMakesAttackUndefended?: (state: GameState, site: { id: string; x: number; y: number }, attacker: UnitState) => boolean
  /** striker is Lethal against matching targets only (Intrepid Hero: Evil) */
  lethalVs?: (state: GameState, striker: UnitState, target: UnitState) => boolean
  /** while in play: enemies of its controller can't tap exactly one defender (Lord of Fear) */
  enemiesCantDefendAlone?: boolean
  /** while in play: players may draw at most one spell per turn (Garden of Eden) */
  limitSpellDraws?: boolean
  /** on a site: projectiles can't enter this square from outside (Impenetrable Copse) */
  blocksProjectiles?: boolean
  /** artifact: nearby minions that can attack must, before the turn may end (Mask of Mayhem) */
  forcesNearbyAttacks?: boolean
  /** this minion must attack if it can, before the turn may end (Tvinnax Berserker) */
  mustAttackSelf?: boolean
  /** while in play: OTHER minions don't untap (Rhitta Gawr of Snowdonia) */
  preventsOtherUntaps?: boolean
  /** while in play: all healing and life gain is multiplied by this, rounded down —
   *  stacks per copy (River of Blood: 0.5; a "can't heal" effect would be 0) */
  healingMultiplier?: number
  /** removal layer: keywords this card STRIPS from a unit, applied after all
   *  grants (Sky Baron: other minions lose Airborne). Works on units, sites,
   *  artifacts, and auras in play. */
  removesKeywords?: (state: GameState, selfId: string, unit: UnitState) => string[]
  /** a unit was declared the target of an attack; fires before the defend
   *  window. A prompt queued here resolves first, and if the target leaves the
   *  attacker's square the fight fizzles (Wills-o'-the-Wisp, Witherwing Hero,
   *  Bridge Troll). */
  onUnitAttacked?: (ctx: EffectAPI, target: UnitState, attacker: UnitState) => void
  /** fires when this SITE is attacked directly — may spawn a self-defender (Free City). ctx.sourceId = the site. */
  onSiteAttacked?: (ctx: EffectAPI, attacker: UnitState) => void
  /** fires after an ALLY finishes resolving an attack it initiated (Sir Agravaine) */
  afterAllyAttack?: (ctx: EffectAPI, attacker: UnitState, targetUnitId: string | null) => void
  /** a unit was killed by a striker's blow; victim is the pre-death snapshot
   *  (Grim Reaper, Blunderbore, Stygian Archers) */
  onUnitKilled?: (ctx: EffectAPI, victim: UnitState, killer: UnitState) => void
  /** THIS unit's blow killed `victim` (pre-death snapshot); fires for every
   *  striker, attacker or defender (Grim Reaper, Sir Pellinore) */
  onKill?: (ctx: EffectAPI, victim: UnitState) => void
  /** this unit can't be relocated by enemy spells/abilities (Talamh Dreig) */
  immovable?: boolean
  /** this unit can't receive power/keyword modifiers, except Wards (Monks of Kobalsa) */
  unmodifiable?: boolean
  /** this unit can't be banished (The Doom of Dilmun) */
  unbanishable?: boolean
  /** on a site: Knights/Sirs/Dames cast here need no threshold (Tournament Grounds) */
  knightsNeedNoThresholdHere?: boolean
  /** on a site: a card cast here (at this site's square) needs no threshold — the site's
   *  own continuous waiver (Dragonlord's Lair: Dragons). `at` is the chosen cast square
   *  (undefined during canCast's optimistic check → be lenient and answer for the site's
   *  own square). */
  siteGrantsNoThreshold?: (state: GameState, site: { id: string; x: number; y: number }, cardId: string, at?: { x: number; y: number }) => boolean
  /** on an aura: covered sites aren't water sites and provide no water threshold (Drought) */
  driesSites?: boolean
  /** this card's event hooks also fire while it lies in a cemetery, with
   *  ctx.sourceId = its card id (Bone Rabble, Scourge Zombies) */
  listensFromCemetery?: boolean
  /** this card's start/end-of-turn triggers don't need it to be at a realm location — they touch
   *  only decks / life / hand (Seer's deck peek). Vivien-in-the-cemetery fires such source triggers;
   *  location-dependent turn triggers (that read the unit's square) are NOT copied from the cemetery. */
  turnTriggersFromCemetery?: boolean
  /** aura placement rule, validated at cast time BEFORE costs are paid — an illegal square rejects
   *  the cast outright (walls: must be your site). `caster` is the unit casting it (a Spellcaster
   *  minion, an Omphalos pseudo-caster, or the avatar), so "nearby" is measured from the CASTER —
   *  Wildfire, cast by a Spellcaster, starts nearby THAT caster, not the avatar. */
  auraPlacement?: (state: GameState, player: PlayerId, at: { x: number; y: number }, caster?: UnitState) => string | null
  /** this aura sits on the BORDER between two sites (a wall). The client places it by
   *  clicking an edge (a site intersection) and passes the chosen side as extra.wallSide */
  edgeAura?: boolean
  /** this aura covers a SINGLE site (1x1), not the standard 2x2 region — cast by clicking one
   *  site (standard site grid), not a 2x2 intersection (Castle's Ablaze!, Hamlet's Ablaze!) */
  singleSiteAura?: boolean
  /** border wall: may this unit step across the wall's edge? return true to BLOCK
   *  (Wall of Air, Wall of Ice) */
  wallBlocks?: (state: GameState, aura: AuraState, unit: UnitState) => boolean
  /** border wall: the unit stepped across the edge (Wall of Fire, Wall of Brambles) */
  wallOnCross?: (ctx: EffectAPI, aura: AuraState, unit: UnitState) => void
  /** a non-Avatar unit took damage (fires after it's applied; the victim may
   *  already be dead — check state.units) (Sawbones, Hemogolem) */
  onUnitDamaged?: (ctx: EffectAPI, victim: UnitState, amount: number, source: DamageSource) => void
  /** a player lost life (avatar damage or direct loss) (Mordric Druids) */
  onLifeLost?: (ctx: EffectAPI, player: PlayerId, amount: number, source: DamageSource | null) => void
  /** on a unit or artifact: shields matching allies (or bearer) from submerging (Driftwood Marrows) */
  protectsAlliesFromSubmerge?: (state: GameState, selfId: string, ally: UnitState) => boolean
  /** on a UNIT: filters other units' steps like a site's entryFilter (Undesirables) */
  unitEntryFilter?: (state: GameState, selfId: string, mover: UnitState, from: Step, to: Step) => boolean
  /** on an aura: avatars on covered squares can't step away / heal / be defended (Sphere of Animosity) */
  auraTrapsAvatars?: boolean
  /** this unit grants extra step destinations to OTHER units (Ruler of Thul) */
  grantsExtraSteps?: (state: GameState, selfId: string, unit: UnitState, from: Step) => Step[]
  /** an Avatar just arrived at Death's Door (Mount Ussar Sanctuary) */
  onDeathsDoor?: (ctx: EffectAPI, avatar: UnitState) => void
  /** on an artifact: fires when a unit picks it up (13 Treasures of Britain) */
  onPickedUp?: (ctx: EffectAPI, bearer: UnitState) => void
  /** on an artifact lying loose: nothing may be picked up at its square (Red Rock) */
  blocksCarryingHere?: boolean
  /** this unit may pick artifacts out of others' hands (Thieving Magpie) */
  stealsCarried?: (state: GameState, picker: UnitState, art: { id: string; name: string }) => boolean
  /** on an aura: artifacts on covered squares can't be dropped (Cursed Iron) */
  aurasPreventDrop?: boolean
  /** enemy projectiles can't enter this unit's square (Sir Morien) */
  unitBlocksProjectiles?: boolean
  /** carried artifact: bearer sees through Stealth for attacks and shots (Truesight Crossbow) */
  bearerTruesight?: boolean
  /** this unit fires on EVERY strike it makes, kill or not (Rowdy Boys) */
  onStrike?: (ctx: EffectAPI, target: UnitState) => void
  /** this unit shields OTHER nearby squares from attacks (White Hart) */
  unitBlocksAttacksAt?: (state: GameState, selfId: string, x: number, y: number) => boolean
  /** this unit shields matching allies from Lethal kills (Sir Priamus) */
  protectsAlliesFromLethal?: (state: GameState, selfId: string, ally: UnitState) => boolean
  /** on a site: units here can't be targeted by enemy spells/abilities (Varmint Warrens) */
  protectsFromTargeting?: (state: GameState, site: { id: string; x: number; y: number; controller: PlayerId | null }, unit: UnitState) => boolean
  /** carried artifact: the bearer ignores site abilities (Key to the City) */
  bearerIgnoresSites?: boolean
  /** this unit silences a specific site while in the realm (Sinterfee) */
  unitSilencesSiteAt?: (state: GameState, selfId: string, site: { id: string; x: number; y: number }) => boolean
  /** this unit strips a specific site's threshold (Sinterfee) */
  unitSuppressesSiteThreshold?: (state: GameState, selfId: string, site: { id: string; x: number; y: number }) => boolean
  /** this card's event hooks also fire while it sits in a HAND, with
   *  ctx.sourceId = its card id (Dodge Roll, Valor response spells) */
  listensFromHand?: boolean
  /** an ally just tapped to defend (Valor's response window) */
  onAllyDefends?: (ctx: EffectAPI, defender: UnitState) => void
  /** abilities usable straight from the hand, surfaced on the owner's Avatar
   *  (Moon Clan Werewolf, Sir Gareth, Slimy Mutants) */
  handAbilities?: (state: GameState, cardId: string, owner: PlayerId) => AbilityDef[]
  /** site: extra threshold this instance provides (Valley of Delight, Sow the Earth) */
  siteExtraThreshold?: (state: GameState, site: { id: string; x: number; y: number; controller: PlayerId | null }) => Partial<Thresholds>
  /** site: provides no mana at all (Wedding Hall) */
  noMana?: boolean
  /** aura: sites are silenced on covered squares. `true` silences EVERY covered site (Acid Rain); a
   *  predicate silences only the sites it returns true for (Atlantean Fate: only non-Ordinary sites). */
  auraSilencesSites?: boolean | ((state: GameState, site: SiteState) => boolean)
  /** aura: artifacts on covered squares lose their text (Acid Rain) */
  auraSilencesArtifacts?: boolean
  /** aura: covered non-Ordinary sites only provide Water threshold (Atlantean Fate) */
  auraLimitsToWaterThreshold?: boolean
  /** aura: no site may be played on covered squares (Salt the Earth) */
  auraBlocksSitePlay?: boolean
  /** site: anyone may conjure matching artifacts here (Dwarven Forge) */
  siteAllowsAnyConjure?: boolean | ((state: GameState, cardName: string) => boolean)
  /** site card: may be played replacing matching sites of ANY player, who keeps
   *  control of the replacement (Heirloom Lost) */
  mayReplaceSite?: (state: GameState, player: PlayerId, site: { id: string; x: number; y: number; controller: PlayerId | null; name: string }) => boolean
  /** site: fires when the site is destroyed, after the rubble appears (Roots of Yggdrasil) */
  onSelfDestroyed?: (ctx: EffectAPI, at: { x: number; y: number }) => void
  /** a unit drowned — killed by being submerged where it can't live (Watery Grave) */
  onDrowned?: (ctx: EffectAPI, victim: UnitState) => void
  /** aura: extra threshold a covered site provides (Sow the Earth's double yield) */
  auraSiteExtraThreshold?: (state: GameState, aura: AuraState, site: { id: string; x: number; y: number; name: string }) => Partial<Thresholds>
  /** attacker replaces an undefended site strike: return true if the script
   *  took over (it must strikeSite() itself if declined) (Dame Britomart) */
  siteStrikeChoice?: (ctx: EffectAPI, siteId: string) => boolean
  /** this caster targeted a unit with a spell (Sir Kay) */
  onTargetsUnit?: (ctx: EffectAPI, target: UnitState) => void
  /** cargo-side carry permission: this unit may ride matching carriers (Sir Tom Thumb) */
  carriedByAnyone?: (state: GameState, carrier: UnitState) => boolean
  /** enemies that can attack this unit must, before ending their turn (The Green Knight) */
  enemiesMustAttackMe?: boolean
  /** artifact: waives threshold for matching cards its controller casts (De Vermis Mysteriis) */
  grantsNoThreshold?: (state: GameState, artifactId: string, cardId: string) => boolean
  /** abilities usable while this card lies in the CEMETERY, surfaced on the
   *  owner's Avatar (Grigori Rasputin) */
  cemeteryAbilities?: (state: GameState, cardId: string, owner: PlayerId) => AbilityDef[]
  /** the subsurface of squares near this unit may be attacked from above (Putrid Presence) */
  allowsSubsurfaceAttackAt?: (state: GameState, selfId: string, x: number, y: number) => boolean
  /** site: enemies may redirect damage dealt to this site onto any unit (City of Souls) */
  siteDamageRedirect?: boolean
  /** artifact placement restriction at conjure time (The Round Table's back row) */
  conjureFilter?: (state: GameState, player: PlayerId, at: { x: number; y: number }) => string | null
  /** artifact: bearer can't gain modifiers at all, ward included (Tabula Rasa) */
  bearerUnmodifiable?: boolean
  /** this unit keeps every square it has ever occupied (Megamoeba, Aethermoeba) */
  occupiesAllVisited?: boolean
  /** condition-driven power bonus this unit grants ITSELF (moeba mass) */
  selfPower?: (state: GameState, self: UnitState) => number
  /** unit-level "ignores the abilities of sites" (Yog-Sothoth) */
  ignoresSites?: boolean
  /** may attack up to N units at the same location simultaneously (Karkemish Chimera) */
  multiAttack?: number
  /** artifact: fires per blow the bearer lands (The Rack) */
  bearerOnStrike?: (ctx: EffectAPI, artifactId: string, target: UnitState) => void
  /** damage to this unit is assigned to one of its stitched parts (Stitched Abomination) */
  takesDamageInParts?: boolean
  /** site: genesis abilities of units dying here fire again as deathrites (The Geistwood) */
  siteGenesisAlsoDeathrite?: boolean
  /** site: enemies searching a deck only see this many top cards (Haystack) */
  limitsEnemySearches?: number
  /** site: mana toll players must pay to access a collection or cemetery (Bureau of Occult Control) */
  zoneAccessToll?: number
  /** abilities usable while this card sits in the SPELLBOOK, surfaced on the
   *  owner's Avatar (The Inquisition after a top-of-deck reveal) */
  spellbookAbilities?: (state: GameState, cardId: string, owner: PlayerId) => AbilityDef[]
  /** artifact: spells/abilities that CAN target it (or its location) MUST (Blasted Oak) */
  compelsTargets?: boolean
  /** extra legal squares for playing this site, beyond the normal rules (Rift Valley) */
  extraSiteSquares?: (state: GameState, player: PlayerId) => { x: number; y: number }[]
  /** fully scripted site play for squares supplied by extraSiteSquares (Rift Valley) */
  customSitePlay?: (state: GameState, player: PlayerId, cardId: string, x: number, y: number) => string | null
  /** site: any site was modified/moved/destroyed, and by whom (Vindictive Nation) */
  onSiteInterference?: (
    ctx: EffectAPI,
    kind: 'modify' | 'move' | 'destroy',
    site: { id: string; x: number; y: number; controller: PlayerId | null },
    by: PlayerId | null,
  ) => void
  /** this site also counts as a void location (The Void) */
  siteAlsoVoid?: boolean
  /** with mayReplaceSite: the supplanted site is banished, not buried (Heirloom Lost FAQ) */
  replacedSiteIsBanished?: boolean
  /** unit: damage dealt to it becomes controller life loss instead — it can't
   *  die of wounds (the Free City fighting as a site) */
  damageBecomesLifeLoss?: boolean
  /** site: keywords granted globally, visible even at SUMMON time
   *  (Kingdom of Agartha: with (E)(E)(E), all minions have Burrowing) */
  summonsGainKeywords?: (state: GameState, siteId: string, player: PlayerId) => string[]
  /** replacement: banish a unit BEFORE it enters the realm — no genesis, no
   *  enter triggers (Order of the White Wing) */
  interceptsUnitEnter?: (state: GameState, selfId: string, entering: UnitState) => boolean
  /** this unit shields matching ALLIES from enemy relocation (Old Salt Anchorman) */
  protectsAlliesFromMoves?: (state: GameState, selfId: string, ally: UnitState) => boolean
  /** modify (or prevent, return 0) damage dealt to a site (Mortal Soil; Panpipes
   *  of Pnom boosts a nearby striker's damage — hence the optional source). */
  siteDamageModifier?: (state: GameState, selfId: string, site: { id: string; x: number; y: number; controller: PlayerId | null }, n: number, source?: DamageSource) => number
  /** prevention hook fired ONLY when one of this aura's affected sites takes damage.
   *  May PROMPT (e.g. Mortal Soil choosing which cemetery minion to banish). Return
   *  true if it handled the damage (prevented it now, or deferred via a prompt) — the
   *  damage is then NOT applied; return false to let the damage proceed. */
  affectedSiteDamage?: (state: GameState, selfId: string, site: { id: string; x: number; y: number; controller: PlayerId | null }, n: number, sourcePlayer: PlayerId, source?: DamageSource) => boolean
  /** Altar of Malachai: when this site's controller's Avatar takes a death blow,
   *  offer to sacrifice one of these minions (atop the site) INSTEAD of dying.
   *  Returns the sacrificeable unit ids (empty = no save available). The Avatar
   *  need not stand on the site. The engine prompts and applies the sacrifice. */
  avatarDeathSave?: (state: GameState, selfId: string, avatar: UnitState) => string[]
  /** a site took damage; fires for all cards in play (City of Glass, Wizard's Den) */
  onSiteDamaged?: (ctx: EffectAPI, site: { id: string; x: number; y: number; name: string }, n: number, by: PlayerId) => void
  /** dynamic extra mana for SITES (e.g. Myrrh's Trophy Room) */
  siteExtraManaFn?: (state: GameState, siteId: string) => number
  /** site forbids summoning at given squares (e.g. No Man's Land) */
  blockSummon?: (state: GameState, site: { x: number; y: number }, at: { x: number; y: number }) => boolean
  /** unit allows its controller to summon minions at its square (e.g. Ominous Owl) */
  allowsSummonHere?: boolean
  /** enemies near this unit lose Ward (e.g. Order of the Pale Worm) */
  stripWard?: 'nearby'
  /** site denies Charge to minions atop nearby sites (e.g. Pebbled Paths) */
  denyChargeNearby?: boolean
  /** artifact static: power granted to units (e.g. Pendragon Banner) */
  artifactGrantsPower?: (state: GameState, artifactId: string, unit: UnitState) => number
  /**
   * Cost modification layer. Every card in play with this hook contributes a
   * delta (negative = discount) to any spell being cast. `sourceId` is the
   * modifier's own instance id; `at` is the summon/conjure square if known.
   */
  costModifier?: (
    state: GameState,
    sourceId: string,
    caster: UnitState,
    cardName: string,
    at?: { x: number; y: number },
  ) => number
  /** cost modification printed on the card being cast itself (e.g. Black Knight) */
  selfCostModifier?: (state: GameState, player: PlayerId, at?: { x: number; y: number }) => number
  /** site: extra mana this site charges the summoner PER effect-summon (not per cast —
   *  the cast path uses costModifier). Fires once for every unit that enters the realm
   *  from a non-cast summon, so it taxes each token of a multi-token effect (Mock Court). */
  summonTax?: (state: GameState, site: { id: string; x: number; y: number; controller: PlayerId | null }, unit: UnitState) => number
  /**
   * A unit entered a new square (movement step, teleport, defend move).
   * `self` is the listening card in play (site or unit script).
   */
  onUnitEntersSquare?: (ctx: EffectAPI, moved: UnitState, from: { x: number; y: number; region: Region }, via?: 'move' | 'forced', final?: boolean) => void
  /**
   * Replaces the Spellcaster requirement: who may cast this spell
   * (e.g. "May be cast by an allied Beast or Dragon"). Return an error
   * string to reject, null to allow.
   */
  casterFilter?: (state: GameState, caster: UnitState) => string | null
  /** additional cast requirement (e.g. Craterize: "discard a site") */
  extraCastCheck?: (state: GameState, player: PlayerId) => string | null
  /**
   * Damage-modification layer with source tracking. Every card in play may
   * transform incoming damage. Return the new amount (or an object to also
   * force lethality). Evaluated after damageReduction.
   */
  damageModifier?: (
    state: GameState,
    selfId: string,
    victim: UnitState,
    amount: number,
    source: DamageSource,
    // `prevented`: this is a true damage PREVENTION (Tufted Turtles' shell), not a mere reduction to 0 —
    // it is FINAL, so no later modifier (e.g. a Panpipes of Pnom boost) can raise the damage back up.
  ) => number | { amount: number; lethal?: boolean; prevented?: boolean }
  /** Rulebook phase of this `damageModifier`. MODIFICATION effects (increase/multiply/cap/replace)
   *  resolve BEFORE prevention; PREVENTION effects ("prevent"/"immune"/"takes less damage" — Makeshift
   *  Barricade, Goswhit Helmet, elemental immunities, Tufted Turtles) resolve AFTER, are counted as a
   *  player's prevention SOURCES (the player orders them when ≥2 apply), and are skipped once damage is 0
   *  (so a consumable isn't wasted). Default (undefined) = a MODIFICATION. */
  damagePreventer?: boolean
  /** PERF/UX: this `damagePreventer` modifier is a PURE read — evaluating it (calling damageModifier)
   *  has NO side effects (an elemental/subtype immunity: return `0` or `amount`, no counters, no bounce,
   *  no log). Set true so the prevention pipeline can DRY-RUN it to decide whether it would actually
   *  reduce THIS hit, and only offer it in the order prompt when it does — no more no-op immunities in
   *  the list. SAFE DEFAULT is unset: an unflagged preventer is never dry-run, so a side-effectful one
   *  (Makeshift Barricade accrues counters, Goswhit bounces to hand) is never fired during preview. */
  damagePreviewPure?: boolean
  /** Ordering of a MODIFICATION `damageModifier` within the modify phase: additions first, then
   *  multiplications, then caps, then lethal-tags (each kind is commutative, so no player choice).
   *  Default 'add'. Ignored when damagePreventer is set. */
  damageModifierKind?: 'add' | 'mul' | 'cap' | 'lethal'
  /** static damage INCREASE (Panpipes of Pnom: "increased to 2"). Applied in a PRE-PASS before the
   *  reduction/prevention `damageModifier` layer, so a boosted hit is what a shell (Tufted Turtles)
   *  then sees and prevents. Boosters must only ever raise (or leave) the amount, never lower it. */
  damageBoost?: (
    state: GameState,
    selfId: string,
    victim: UnitState,
    amount: number,
    source: DamageSource,
  ) => number
  /** Royal Bodyguard: this unit MAY take damage aimed at a nearby Avatar / royalty instead. Returns
   *  true if THIS guard could shield `victim` right now; the engine then offers the redirect (a yesNo
   *  prompt) at the moment the victim would take a standalone hit. */
  guardsRoyalty?: (state: GameState, guard: UnitState, victim: UnitState) => boolean
  /** A monument that absorbs damage (its damageModifier accrues `counters.absorbed`) breaks once the total
   *  soaked up in one simultaneous-damage event reaches this threshold. Makeshift Barricade = 3, so 1+1+1
   *  dealt to three allies here at once breaks it (FAQ). Settled at the outermost checkStateBased. */
  breaksWhenAbsorbed?: number
  /** bearer's strike damage is multiplied (e.g. Grim Guisarme ×2) */
  bearerStrikeMultiplier?: number
  /** unit/bearer can't be damaged or targeted by Magic spells (e.g. Failed Mutation, Amulet of Niniane) */
  magicProtected?: boolean | ((state: GameState, selfId: string, unit: UnitState) => boolean)
  /** extra elemental affinity granted to the controller (e.g. Elementalist, elemental Cores) */
  affinityBonus?: Partial<Thresholds>
  /** minion may be summoned atop ANY site (e.g. Roaming Monster) */
  summonAnywhere?: boolean
  /** minion can't move to defend (e.g. Skeleton tokens) */
  cantDefend?: boolean
  /** minion can never defend, even in place (e.g. Recurring Specter) */
  cantDefendEver?: boolean
  /** deck building: any number of copies allowed (e.g. Grey Wolves) */
  deckLimitExempt?: boolean
  /** artifact cannot be dropped by its bearer (e.g. Blade of Thorns) */
  cantDrop?: boolean
  /** unit is disabled while this condition holds (e.g. Bound Spirit) */
  selfDisabled?: (state: GameState, self: UnitState) => boolean
  /** this site can't be destroyed (e.g. Bedrock) */
  indestructibleSite?: boolean
  /** this site can't be moved/rearranged (e.g. Bedrock — Earthquake, Baba Yaga, etc.) */
  immovableSite?: boolean
  /** this site can't be modified in any way (e.g. Bedrock — flooded, silenced, transformed, granted abilities) */
  unmodifiableSite?: boolean
  /** unit protects a site from DESTRUCTION only (e.g. Order of the Sacred Oak — the site can still be
   *  moved and modified). A card that also immobilizes (Bluecap Knockers) additionally sets immobilizesSite. */
  protectsSite?: (state: GameState, self: UnitState, site: { id: string; x: number; y: number }) => boolean
  /** unit also forbids MOVING/rearranging a site (e.g. Bluecap Knockers: "can't be moved, destroyed, or modified") */
  immobilizesSite?: (state: GameState, self: UnitState, site: { id: string; x: number; y: number }) => boolean
  /** this unit may carry other units (Carrying Units rule) */
  carryUnits?: {
    capacity: number | 'any'
    /** extra restriction, e.g. "a weaker allied minion" */
    filter?: (state: GameState, carrier: UnitState, target: UnitState) => boolean
    /** may carry an Avatar too ("may carry an ally" — Fine Courser, War Horse).
     *  Default (undefined/false) keeps avatars uncarriable ("allied minion"). */
    allowAvatar?: boolean
  }
  /** unit occupies a 2x2 area (e.g. Mountain Giant) */
  oversized?: boolean
  /** the client offers carriable artifacts as summon-placement targets (Mimic) */
  summonTargetsCarriable?: boolean
  /** projectiles fly over this unit (e.g. Crawler) */
  projectileTransparent?: boolean | ((state: GameState, self: UnitState) => boolean)
  /** minion must be summoned to this region (e.g. Drowned → 'underwater') */
  mustSummonRegion?: Region
  /** static: reduce damage dealt to `victim` (e.g. Shield Maidens) */
  damageReduction?: (state: GameState, self: UnitState, victim: UnitState) => number
  /** static: keywords a SITE grants to units (e.g. Standing Stones) */
  siteGrantsKeywords?: (state: GameState, site: { id: string; x: number; y: number; controller: PlayerId | null }, unit: UnitState) => string[]
  /**
   * "Printed area" damage preview. Given the fully-chosen cast parameters
   * (direction / target square / target sites / edge — the same bag the cast
   * cont consumes), return the ABSOLUTE squares this spell will damage and the
   * printed damage on each. Pure & side-effect-free: it computes the pattern
   * only, so the client can render a final-confirmation overlay before the cast
   * resolves. Returns null when not enough parameters are chosen yet. The engine
   * `areaDamagePreview()` helper wraps this and stamps on the spell's element. */
  areaDamage?: (state: GameState, casterId: string, params: AreaDamageParams) => { x: number; y: number; dmg: number }[] | null
  /** Engine-authoritative legal-target set for the pick at `specIndex`, given the targets already
   *  picked this cast (interdependent or spatial picks). When present, the ENGINE validates each
   *  submitted target against this set (castSpell rejects anything outside it) and the CLIENT
   *  highlights/permits EXACTLY this set — nobody re-derives legality per candidate. Use for picks
   *  whose legality isn't expressible by a plain TargetSpec: explosion step-range, Meteor Shower's
   *  "share no borders with an already-chosen site". Return the full set for `specIndex`; `picked`
   *  holds the refs chosen for earlier specs this cast. */
  targetOptions?: (state: GameState, caster: UnitState, picked: TargetRef[], specIndex: number) => TargetRef[]
  /** continuations for ask(); key → handler */
  conts?: Record<string, (ctx: EffectAPI, contCtx: any, choice: any) => void>
  /** UI hint: how to pick `at` when casting (minions default to own sites) */
  castAt?: 'ownSite' | 'anySite' | 'anySquare'
  /** the card may be cast from the cemetery (e.g. Ghostfire, Recurring Specter) */
  castFromCemetery?: {
    /** banish instead of returning to the cemetery after resolving */
    banishAfter?: boolean
  }
  /**
   * Death-replacement: `dying` is about to die; return true if this card
   * replaced the death (healed/bounced/sacrificed something instead).
   * `selfId` is the listening card's instance id (unit or artifact).
   */
  onWouldDie?: (state: GameState, selfId: string, dying: UnitState) => boolean
  // ---- movement topology ----
  /** restrict this unit's own steps (e.g. Dalcean Phalanx: forward only) */
  stepFilter?: (state: GameState, unit: UnitState, from: Step, to: Step) => boolean
  /** site/artifact blocks OTHER units from entering/stepping (e.g. Gnome Hollows, Great Wall) */
  entryFilter?: (state: GameState, selfId: string, unit: UnitState, from: Step, to: Step) => boolean
  /** the entryFilter is an ABSOLUTE entry ban that also blocks FORCED entry (teleport / Blink /
   *  Teleport), not only a unit stepping in — e.g. Gnome Hollows' power cap. Ground/positional
   *  step restrictions (Great Wall, Mountain Pass) leave this off so a pull can still land there. */
  entryFilterBlocksForcedEntry?: boolean
  /** the entryFilter blocks PUSH/pull/drag forced entry (River Rapids, Grapple Shot, Pudge's hook…)
   *  but NOT a genuine Teleport. Perilous Bridge: "only a Teleport may cross the top border on the
   *  ground; a pull may not." Callers of ctx.teleport tag push-type relocations with { push: true }. */
  entryFilterBlocksPush?: boolean
  /** additional legal steps beyond the normal rules (e.g. Felbog leap, Polar wrap). `selfId` is the
   *  id of the site/artifact/unit whose script this is — use it to act on THIS instance, not a
   *  find-by-name (which breaks with two copies). */
  extraSteps?: (state: GameState, unit: UnitState, from: Step, selfId: string) => Step[]
  /** this unit's step from→to costs 0 ("moves freely", e.g. East-West Dragon sideways) */
  freeStep?: (state: GameState, unit: UnitState, from: Step, to: Step) => boolean
  /** an ARTIFACT grants a free (0-cost) step to a qualifying unit — Arcade of Bones: Undead in its row */
  artifactFreeStep?: (state: GameState, artifactId: string, unit: UnitState, from: Step, to: Step) => boolean
  /** site placement extension/restriction (e.g. Cornerstone corners, Edge of the World) */
  sitePlacement?: (state: GameState, player: PlayerId, at: { x: number; y: number }) => 'allow' | 'deny' | null
  // ---- combat roles & strike effects ----
  /** strikes first only in a given role (e.g. Albespine Pikemen while attacking) */
  strikesFirstWhen?: 'attacking' | 'defending'
  /** doesn't strike in a given role (e.g. Escyllion Cyclops while defending) */
  noStrikeWhen?: 'attacking' | 'defending'
  /** this unit's strike damage against units heals its controller (Blood Ravens) */
  strikeLifelink?: boolean
  /** bonus power for allies striking SITES (e.g. Boudicca +3) */
  siteStrikeBonus?: (state: GameState, selfId: string, striker: UnitState) => number
  /** static: power a SITE grants to units (e.g. Desecrated Ground) */
  siteGrantsPower?: (state: GameState, site: { id: string; x: number; y: number; controller: PlayerId | null }, unit: UnitState) => number
  /** a player drew a card (Chains of Prometheus, Iron Maiden) */
  onCardDrawn?: (ctx: EffectAPI, player: PlayerId, deck: 'spellbook' | 'atlas') => void
  /** a unit was tapped (False Idol) */
  onUnitTapped?: (ctx: EffectAPI, tapped: UnitState) => void
  /** an allied unit struck an enemy Avatar (Interrogator) */
  onAllyStrikesAvatar?: (ctx: EffectAPI, striker: UnitState, avatar: UnitState) => void
}

type Step = { x: number; y: number; region: Region }

/** who/what is dealing this damage */
export interface DamageSource {
  player: PlayerId
  kind: 'strike' | 'projectile' | 'magic' | 'ability' | 'effect'
  /** a RANGED STRIKE (the Ranged keyword) — a projectile that IS a strike, so strike-damage
   *  modifiers (Grim Guisarme's double) apply, unlike a spell/ability projectile. */
  rangedStrike?: boolean
  /** strike from a fight nobody defended (Mordric Druids) */
  undefended?: boolean
  /** card name of the damage source, when known */
  name?: string
  /** striking unit, for strikes */
  attackerId?: string
  /** the UNIT whose ability/effect deals this damage (kill-credit; not set for magic —
   *  a spell's damage is credited to its caster at priority 2, not to the unit) */
  sourceUnitId?: string
  /** elements of the source card (e.g. fire spells) */
  elements?: string[]
}

const registry = new Map<string, CardScript>()

export function registerScript(name: string, script: CardScript): void {
  if (registry.has(name.toLowerCase())) {
    // a silent overwrite once cost us six working scripts — shout about it
    // eslint-disable-next-line no-console
    console.warn(`[registry] DUPLICATE script registration for "${name}" — the later one wins.`)
  }
  registry.set(name.toLowerCase(), script)
  scriptedNames.add(name)
}

export function getScript(name: string): CardScript | undefined {
  return registry.get(name.toLowerCase())
}

/** The element that tints a spell's damage overlay (fire/earth/water/air), or
 *  'fire' as a neutral default when a card declares none. */
export function areaDamageElement(name: string): string {
  const c = getCard(name)
  const el = c.elements?.[0]?.toLowerCase()
  if (el === 'fire' || el === 'earth' || el === 'water' || el === 'air') return el
  // fall back to whichever threshold this card requires
  const th = c.thresholds
  if (th) {
    const best = (['fire', 'earth', 'water', 'air'] as const)
      .map((k) => [k, th[k] ?? 0] as const)
      .sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] > 0) return best[0]
  }
  return 'fire'
}

/**
 * Pure preview of a "printed area" damage spell. Returns the absolute squares it
 * will damage (each with its printed damage) plus the spell's element, WITHOUT
 * applying anything — the client renders a final-confirmation overlay from this.
 * Returns null when the spell isn't an area-damage spell, isn't scripted, or not
 * enough parameters have been chosen yet.
 */
export function areaDamagePreview(
  state: GameState,
  name: string,
  casterId: string,
  params: AreaDamageParams,
): { cells: { x: number; y: number; dmg: number }[]; element: string } | null {
  const script = getScript(name)
  if (!script?.areaDamage) return null
  const cells = script.areaDamage(state, casterId, params)
  if (!cells || cells.length === 0) return null
  return { cells, element: areaDamageElement(name) }
}
