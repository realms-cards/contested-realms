// Core game state types. Everything here must stay JSON-serializable:
// the server persists/replays state and ships redacted copies to clients.

export type PlayerId = 0 | 1
export type Element = 'air' | 'earth' | 'fire' | 'water'
export type Region = 'surface' | 'underground' | 'underwater' | 'void'
export type CardType = 'Avatar' | 'Site' | 'Minion' | 'Magic' | 'Aura' | 'Artifact'
export type DeckName = 'spellbook' | 'atlas'

export interface Thresholds {
  air: number
  earth: number
  fire: number
  water: number
}

/** Static card definition, from cards.json (or a token definition). */
export interface CardDef {
  name: string
  type: CardType
  rarity: 'Ordinary' | 'Exceptional' | 'Elite' | 'Unique' | null
  cost: number | null
  attack: number | null
  defence: number | null
  life: number | null
  elements: string[]
  subtypes: string[]
  thresholds: Thresholds
  text: string
  sets: string[]
  img: string | null
  /** double-faced cards (the Druid): the flip-side art + rules text. */
  flipImg?: string | null
  flipText?: string
  /** true for in-play-only token cards (never in decks) */
  token?: boolean
}

/** One physical card in the game (deck, hand, realm, cemetery...). */
export interface CardInstance {
  id: string
  name: string
  owner: PlayerId
  isToken?: boolean
  /** chosen alternative art (printing slug) from the owner's deck. Cosmetic; travels to the opponent only
   *  for cards they can see (viewFor sends visible instances only), so it never leaks unrevealed cards. */
  art?: string
}

export type Duration = 'endOfTurn' | 'untilYourNextTurn' | 'permanent'

export interface Modifier {
  kind: 'power' | 'keyword' | 'text'
  amount?: number
  keyword?: string
  /** a keyword modifier that STRIPS the keyword instead of granting it (editor tool) */
  remove?: boolean
  note?: string
  duration: Duration
  /** turn number the modifier was applied (for untilYourNextTurn cleanup) */
  turn: number
  sourcePlayer: PlayerId
}

export interface UnitState {
  id: string
  cardId: string
  name: string
  owner: PlayerId
  controller: PlayerId
  isAvatar: boolean
  x: number
  y: number
  region: Region
  tapped: boolean
  damage: number
  /** turn the minion entered the realm (summoning sickness) */
  enteredTurn: number
  /** avatar only */
  life?: number
  deathsDoor?: boolean
  /** turn on which the avatar hit death's door (damage immunity that turn) */
  doorTurn?: number
  modifiers: Modifier[]
  /** artifact instance ids carried by this unit */
  carrying: string[]
  /** unit instance ids carried by this unit (Carrying Units rule) */
  carryingUnits: string[]
  /** id of the unit carrying this one, if any */
  carriedBy?: string | null
  /** 2x2 oversized units occupy the square at (x,y) plus right/down neighbors */
  size?: '2x2'
  /** additional occupied squares beyond (x,y) — growing/stretched bodies
   *  (Megamoeba, Aethermoeba, Yog-Sothoth, The Rack). Region defaults to the
   *  unit's own region when omitted. */
  extraSquares?: { x: number; y: number; region?: Region }[]
  stealth?: boolean
  ward?: boolean
  disabled?: boolean
  silenced?: boolean
  /** double-faced avatar flipped to its back side (the Druid → Bruin/aura form) */
  flipped?: boolean
  /** the turn number on which this unit last "interacted with the realm" (struck, dealt
   *  damage, cast a spell, or activated a special ability). Gates the Drop basic ability:
   *  a unit can only drop artifacts if it HASN'T interacted this turn. Compared === turn,
   *  so a stale prior-turn value auto-clears. */
  interactedTurn?: number
  /** ability uses this turn, keyed by ability key (e.g. 'pickup', 'drop', site ability) */
  usedThisTurn: Record<string, number>
  /** free-form counters for scripted cards */
  counters?: Record<string, number>
}

export interface SiteState {
  id: string
  cardId: string
  name: string
  owner: PlayerId
  /** rubble is controlled by no one */
  controller: PlayerId | null
  x: number
  y: number
  tapped: boolean
  isRubble: boolean
  ward?: boolean
  /** flooded sites gain ≥1 water affinity and count as water sites */
  flooded?: boolean
  /** A face-down SITE TRAP. While set, `name` is the basic site of `element` (Spire/Valley/
   *  Wasteland/Stream) and the site masquerades as it for every purpose; the true card is revealed
   *  (name ← realName, this field cleared) only when the trap is sprung or destroyed. `realName` /
   *  `realCardId` are redacted for everyone but the owner in viewFor — the opponent never receives
   *  the real identity. */
  trap?: { element: Element; realName?: string; realCardId?: string }
  counters?: Record<string, number>
}

export interface ArtifactState {
  id: string
  cardId: string
  name: string
  /** conjuring player; carried artifacts are controlled by the carrier's controller */
  conjuredBy: PlayerId
  x: number
  y: number
  region: Region
  carriedBy: string | null
  tapped: boolean
  counters?: Record<string, number>
}

export interface AuraState {
  id: string
  cardId: string
  name: string
  controller: PlayerId
  /** squares the aura occupies (surface) */
  squares: { x: number; y: number }[]
  /** the 2x2 top-left anchor a standard aura was placed at; lets checkStateBased
   *  re-derive its coverage (e.g. Magellan Globe edge-wrap on/off). Absent for
   *  edge/wall auras and self-managed ones (Wildfire, which moves). */
  anchor?: { x: number; y: number }
  /** border walls sit on the edge between two adjacent squares (Wall of Fire…) */
  edge?: { a: { x: number; y: number }; b: { x: number; y: number } }
  /** turn the aura entered the realm — Enchantress animates it summoning-sick only
   *  if it was cast THIS turn (absent for effect-made auras → treated as not sick) */
  enteredTurn?: number
  /** Wildfire is conjured ATOP A SITE and roams between sites. It tracks the site it
   *  currently sits on (and its visited set) by site id — not by coordinate — so a site
   *  that is moved/relocated carries the fire with it and is not re-burned or skipped. */
  onSiteId?: string
  counters?: Record<string, number>
}

export interface PlayerState {
  id: PlayerId
  name: string
  avatarUnitId: string
  /** ordered card instance ids; index 0 = top */
  atlas: string[]
  spellbook: string[]
  hand: string[]
  cemetery: string[]
  banished: string[]
  /** the deck's collection pool (card name → remaining copies) that "from your
   *  collection" effects fetch from; empty when the deck defines none */
  collection: Record<string, number>
  mana: number
  /** true once the player has kept their opening hand */
  keptHand: boolean
  usedAvatarSiteAbility: boolean
  /** true once this player has resolved their forced first-turn site placement */
  firstSiteDone?: boolean
  /** true once this player's avatar has actually established a site under itself (played its first
   *  site). Distinct from firstSiteDone (which tests force): gates the "avatar stranded in the void
   *  → mandatory site play" rule, so a never-established avatar (a bare fixture) doesn't trigger it. */
  established?: boolean
}

export type PromptKind =
  | 'drawDeck'          // choose spellbook or atlas at start phase
  | 'defend'            // opponent may tap defenders
  | 'stayInFight'       // original target stays in the fight?
  | 'intercept'         // opponent may intercept at final square
  | 'allocateDamage'    // split a side's damage among enemy units
  | 'chooseTargets'     // mid-effect target choice
  | 'yesNo'
  | 'chooseOption'
  | 'chooseSquare'
  | 'chooseCards'       // pick N cards from a revealed list (deck reordering, tutors)
  | 'orderCards'        // arrange a revealed set into a chosen order (Observatory, Browse)
  | 'nameCard'          // type/pick any card name (Feast for Crows, Hyter Sprites)
  | 'firstSite'         // forced first-turn site placement (pick a site from hand)
  | 'sitePermutation'   // rearrange the sites within a 2x2 area (Earthquake) — client sends the final permutation

export interface Prompt {
  id: string
  player: PlayerId
  kind: PromptKind
  title: string
  /** kind-specific payload the client renders (candidate ids, options, squares...) */
  data: any
  /** continuation key into the engine's continuation registry + its context */
  cont: string
  ctx: any
}

export interface LogEvent {
  turn: number
  player: PlayerId | null
  msg: string
}

export type Phase = 'mulligan' | 'start' | 'main' | 'end' | 'over'

/** chess-style clock configuration (milliseconds) */
export interface ClockConfig {
  /** starting time per player */
  base: number
  /** time added to a player at the end of each of their turns */
  inc: number
}

/** live clock carried in GameState — numeric only (no wall-clock timestamps), so
 *  the engine stays deterministic; the authority layer (server/client) ticks it */
export interface ClockState {
  base: number
  inc: number
  /** remaining milliseconds per player */
  remaining: [number, number]
}

export interface GameState {
  version: number
  seed: number
  turn: number
  activePlayer: PlayerId
  phase: Phase
  firstPlayer: PlayerId
  players: [PlayerState, PlayerState]
  /** all card instances by id */
  cards: Record<string, CardInstance>
  units: Record<string, UnitState>
  sites: Record<string, SiteState>
  artifacts: Record<string, ArtifactState>
  auras: Record<string, AuraState>
  /** prompt queue; index 0 is the active prompt */
  prompts: Prompt[]
  log: LogEvent[]
  winner: PlayerId | null
  /** true when the game ended with NO winner — both Avatars fell to one simultaneous blow
   *  (phase is 'over' and winner is null). A normal ongoing game has phase !== 'over'. */
  draw?: boolean
  nextId: number
  /** transient flags used by multi-step flows (serializable) */
  flow?: any
  /** "wait, I forgot!" window: the non-active player acts with approval */
  interject?: { player: PlayerId; prevActive: PlayerId } | null
  /** optional chess-style clock (absent = untimed game) */
  clock?: ClockState
  /** hand cards a player has been shown (cardId → viewer ids who've seen it),
   *  e.g. Lookout / Accusation / The Inquisition. Kept out of the broadcast view;
   *  viewFor uses it to un-hide those specific cards for the entitled viewer. */
  handReveals?: Record<string, PlayerId[]>
  /** the most recently cast spell / played site, for the client's card-detail
   *  panel (a played card is public info, so this is safe in both players' views).
   *  `n` is a monotonic counter so the client can detect a fresh play. */
  lastPlay?: { name: string; player: PlayerId; n: number }
}

// ---- actions ----

export interface Step {
  x: number
  y: number
  region: Region
}

export type AttackTarget = { unit: string } | { site: string }

export type Action =
  | { t: 'mulligan'; back: string[] }
  | { t: 'keepHand' }
  | { t: 'drawChoice'; deck: DeckName }
  | { t: 'avatarSite'; mode: 'draw' } // tap avatar to draw a site
  | { t: 'avatarSite'; mode: 'play'; cardId: string; x: number; y: number }
  | {
      t: 'castSpell'
      cardId: string
      casterId: string
      /** summon square for minions / artifacts, anchor for auras */
      at?: { x: number; y: number; region?: Region }
      targets?: string[]
      /** script-specific choice payload */
      extra?: any
    }
  | { t: 'moveAttack'; unitId: string; path: Step[]; attack?: AttackTarget }
  | { t: 'activate'; sourceId: string; ability: string; targets?: string[]; at?: { x: number; y: number; region?: Region }; extra?: any }
  | { t: 'pickUp'; unitId: string; artifactIds: string[]; unitIds?: string[] }
  | { t: 'drop'; unitId: string; artifactIds: string[]; unitIds?: string[] }
  | { t: 'endTurn' }
  | { t: 'prompt'; promptId: string; choice: any }
  | { t: 'concede' }
  | { t: 'addTime'; player: PlayerId; ms: number } // gift time to another seat's chess clock
  | { t: 'judge'; op: JudgeOp }
  | { t: 'requestInterject' }
  | { t: 'endInterject' }

/**
 * Manual "tabletop" adjustments for resolving card text the engine doesn't
 * automate. Either player may use them; everything is logged.
 */
export type JudgeOp =
  | { k: 'life'; player: PlayerId; delta: number }
  | { k: 'mana'; player: PlayerId; delta: number }
  | { k: 'damage'; unitId: string; amount: number }
  | { k: 'heal'; unitId: string; amount: number }
  | { k: 'kill'; unitId: string }
  | { k: 'banish'; unitId: string }
  | { k: 'bounce'; unitId: string }
  | { k: 'move'; unitId: string; x: number; y: number; region: Region }
  | { k: 'moveArtifact'; artifactId: string; x: number; y: number; region: Region }
  | { k: 'tap'; id: string; tapped: boolean }
  | { k: 'power'; unitId: string; amount: number; duration: Duration }
  | { k: 'keyword'; unitId: string; keyword: string; duration: Duration; remove?: boolean }
  | { k: 'setAvatar'; player: PlayerId; name: string }
  | { k: 'setController'; unitId: string; player: PlayerId } // editor: hand a minion to a player
  | { k: 'setArtifactController'; artifactId: string; player: PlayerId } // editor: hand a ground artifact/monument to a player
  | { k: 'disable'; unitId: string; on: boolean }
  | { k: 'silence'; unitId: string; on: boolean }
  | { k: 'summonSick'; unitId: string; on: boolean }
  | { k: 'stealth'; unitId: string; on: boolean }
  | { k: 'ward'; unitId: string; on: boolean }
  | { k: 'draw'; player: PlayerId; deck: DeckName }
  | { k: 'token'; name: string; player: PlayerId; x: number; y: number; region: Region }
  | { k: 'destroySite'; siteId: string; toBanish?: boolean }
  | { k: 'replaceSite'; siteId: string; name: string } // swap a site for another site in the same spot (same controller)
  | { k: 'siteWard'; siteId: string; on: boolean }
  | { k: 'flood'; siteId: string; on: boolean }
  // scenario creation: materialize REAL cards directly (no genesis, no cost)
  | { k: 'summonUnit'; name: string; player: PlayerId; x: number; y: number; region: Region; noGenesis?: boolean }
  | { k: 'placeSite'; name: string; player: PlayerId; x: number; y: number }
  | { k: 'spawnArtifact'; name: string; player: PlayerId; x: number; y: number; giveTo?: string }
  | { k: 'addToHand'; name: string; player: PlayerId }
  | { k: 'discard'; cardId: string } // editor: discard a specific (visible) card from its owner's hand
  | { k: 'addToCemetery'; name: string; player: PlayerId }
  | { k: 'addToCollection'; name: string; player: PlayerId }
  | { k: 'removeArtifact'; artifactId: string; toBanish?: boolean }
  | { k: 'removeAura'; auraId: string; toBanish?: boolean }
  | { k: 'setLife'; player: PlayerId; value: number }
  | { k: 'setMana'; player: PlayerId; value: number }
  | { k: 'threshold'; player: PlayerId; element: Element; delta: number }
  | { k: 'untap'; player: PlayerId }
  | { k: 'setArt'; cardId: string; slug: string | null } // editor: change a card's alternative art (null = default)
  | { k: 'setRegion'; id: string; region: Region } // editor: bury/submerge/surface a minion or artifact in place

export interface ActionResult {
  ok: boolean
  error?: string
}
