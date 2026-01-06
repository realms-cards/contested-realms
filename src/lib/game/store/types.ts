import type {
  InteractionDecision,
  InteractionEnvelope,
  InteractionGrant,
  InteractionGrantRequest,
  InteractionMessage,
  InteractionRequestKind,
  InteractionRequestMessage,
  InteractionResponseMessage,
  InteractionResultMessage,
} from "@/lib/net/interactions";
import type { GameTransport, CustomMessage } from "@/lib/net/transport";
import type {
  BurrowAbility,
  ContextMenuAction,
  PermanentPosition,
  PermanentPositionState,
  PlayerPositionReference,
  SitePositionData,
} from "../types";
import type { RemoteCursorState } from "./remoteCursor";
export { REMOTE_CURSOR_TTL_MS } from "./remoteCursor";
export type { RemoteCursorState } from "./remoteCursor";

export type Phase = "Setup" | "Start" | "Draw" | "Main" | "End";
export type PlayerKey = "p1" | "p2";

export type Thresholds = {
  air: number;
  water: number;
  earth: number;
  fire: number;
};

export type LifeState = "alive" | "dd" | "dead";

export type PlayerState = {
  life: number;
  lifeState: LifeState; // 'alive', 'dd' (Death's Door), 'dead'
  mana: number; // manual offset to available mana (can be negative when cards are played)
  thresholds: Thresholds;
};

export type BoardSize = { w: number; h: number };
export type CellKey = string; // `${x},${y}`
export type SiteTile = {
  owner: 1 | 2;
  tapped?: boolean;
  card?: CardRef | null;
};
export type BoardState = {
  size: BoardSize;
  sites: Record<CellKey, SiteTile>;
};

export type BoardPingEvent = {
  id: string;
  position: { x: number; z: number };
  playerId: string | null;
  playerKey: PlayerKey | null;
  ts: number;
};

// --- Remote cursor telemetry -----------------------------------------------

export type InteractionRecordStatus =
  | "pending"
  | InteractionDecision
  | "expired";

export type InteractionRequestEntry = {
  request: InteractionRequestMessage;
  response?: InteractionResponseMessage;
  status: InteractionRecordStatus;
  direction: "inbound" | "outbound";
  grant?: InteractionGrant | null;
  proposedGrant?: InteractionGrantRequest | null;
  receivedAt: number;
  updatedAt: number;
  // Optional result emitted by the server after executing an approved request
  result?: InteractionResultMessage;
};

export type InteractionStateMap = Record<string, InteractionRequestEntry>;

export type SendInteractionRequestInput = {
  from: string;
  to: string;
  kind: InteractionRequestKind;
  matchId?: string;
  payload?: Record<string, unknown>;
  note?: string;
  requestId?: string;
  grant?: InteractionGrantRequest;
};

export type InteractionResponseOptions = {
  reason?: string;
  payload?: Record<string, unknown>;
  grant?: InteractionGrantRequest;
};

// Minimal card reference for zones
export type CardRef = {
  cardId: number;
  variantId?: number | null;
  name: string;
  type: string | null;
  subTypes?: string | null; // card subtypes (e.g., "Monument", "Automaton", "Weapon", etc.)
  slug?: string | null; // variant slug for images
  thresholds?: Partial<Thresholds> | null; // threshold requirements
  cost?: number | null; // mana cost
  owner?: PlayerKey | null;
  instanceId?: string | null;
};

export type Zones = {
  spellbook: CardRef[]; // spells/creatures
  atlas: CardRef[]; // sites
  hand: CardRef[];
  graveyard: CardRef[];
  battlefield: CardRef[]; // non-site permanents for now
  collection: CardRef[];
  banished: CardRef[]; // removed for the rest of the game
};

// Shared base for all board entities (avatars and permanents)
export type EntityBase<TCard> = {
  card: TCard;
  offset?: [number, number] | null;
  tapped?: boolean;
};

// Champion reference for Dragonlord avatar
export type ChampionRef = {
  cardId: number;
  name: string;
  slug?: string | null;
};

export type AvatarState = EntityBase<CardRef | null> & {
  pos: [number, number] | null;
  counters?: number | null;
  champion?: ChampionRef | null; // Dragonlord champion dragon
};

// --- Imposter Mask State (Gothic expansion) --------------------------------
// Imposter can "mask" by banishing an Avatar from collection to gain their abilities.
// The mask breaks when damaged or when putting on a new mask.
export type ImposterMaskState = {
  // The original Imposter avatar card (preserved to restore when unmasked)
  originalAvatar: CardRef;
  // The mask avatar card (from collection, now displayed as the avatar)
  maskAvatar: CardRef;
  // Timestamp when mask was applied (for syncing)
  maskedAt: number;
};

// --- Imposter Mana Cost --------------------------------
export const IMPOSTER_MASK_COST = 3; // Mana cost to mask yourself

// --- Necromancer Mana Cost --------------------------------
export const NECROMANCER_SKELETON_COST = 1; // Mana cost to summon a Skeleton token

// --- Animist Cast Choice --------------------------------
// When Animist plays a magic card, they can choose to cast it as a magic or as a spirit
export type AnimistCastMode = "magic" | "spirit";

export type PendingAnimistCast = {
  id: string;
  casterSeat: PlayerKey;
  card: CardRef;
  manaCost: number; // The card's mana cost (used as power if cast as spirit)
  cellKey: CellKey; // Where the card will be placed
  handIndex: number; // Index in hand where card was selected
  status: "choosing" | "resolved";
  chosenMode: AnimistCastMode | null;
};

// --- Druid Flip State --------------------------------
// Tracks when a Druid avatar has been flipped (one-way transformation)

// --- Special Site State (Valley of Delight, Bloom sites, etc.) --------------------------------
export type ElementChoice = "air" | "water" | "earth" | "fire";

// Tracks Valley of Delight element choices per site instance
export type ValleyOfDelightChoice = {
  cellKey: CellKey;
  element: ElementChoice;
  owner: 1 | 2;
};

// Tracks bloom sites played this turn (for temporary threshold bonus)
export type BloomSiteBonus = {
  cellKey: CellKey;
  siteName: string;
  thresholds: Partial<{
    air: number;
    water: number;
    earth: number;
    fire: number;
  }>;
  turnPlayed: number;
  owner: 1 | 2;
};

// Tracks genesis mana bonuses (Ghost Town, etc.)
export type GenesisManaBonus = {
  cellKey: CellKey;
  siteName: string;
  manaAmount: number;
  turnPlayed: number;
  owner: 1 | 2;
};

// Pending element choice for Valley of Delight overlay
export type PendingElementChoice = {
  cellKey: CellKey;
  siteName: string;
  owner: 1 | 2;
  chooserSeat: PlayerKey;
};

// Special site state container
export type SpecialSiteState = {
  // Permanent element choices for Valley of Delight sites
  valleyChoices: ValleyOfDelightChoice[];
  // Temporary bloom bonuses (cleared at end of turn)
  bloomBonuses: BloomSiteBonus[];
  // Temporary mana bonuses (cleared at end of turn)
  genesisMana: GenesisManaBonus[];
  // Pending element choice (shows overlay)
  pendingElementChoice: PendingElementChoice | null;
};

// --- Harbinger Portal State (Gothic expansion) --------------------------------
export type PortalRollPhase = "pending" | "rolling" | "complete";

export type PortalPlayerState = {
  rolls: number[]; // Raw D20 results (1-20)
  tileNumbers: number[]; // Final unique tile numbers (1-20)
  rollPhase: PortalRollPhase;
};

export type PortalState = {
  // Which players have Harbinger avatar (detected by name)
  harbingerSeats: PlayerKey[];
  // Per-player portal state
  p1: PortalPlayerState | null;
  p2: PortalPlayerState | null;
  // Current player rolling (for sequential dual-harbinger)
  currentRoller: PlayerKey | null;
  // Overall setup complete flag
  setupComplete: boolean;
};

// --- Second Player Seer State ------------------------------------------------
export type SeerPlayerStatus = "pending" | "revealed" | "completed" | "skipped";

export type SeerState = {
  // Which player is the second seat (gets the seer ability)
  secondSeat: PlayerKey;
  // Status of the seer phase
  status: SeerPlayerStatus;
  // Which pile was chosen (null if not yet chosen)
  chosenPile: "spellbook" | "atlas" | null;
  // The decision made (null if not yet decided)
  decision: "top" | "bottom" | "skip" | null;
  // Overall setup complete flag
  setupComplete: boolean;
};

export type PermanentItem = EntityBase<CardRef> & {
  owner: 1 | 2;
  tilt?: number;
  instanceId?: string | null;
  tapVersion?: number; // Version counter for tap/untap state changes
  version?: number; // Generic version counter for other state changes
  // Optional attachment to a permanent at the same tile
  attachedTo?: { at: CellKey; index: number } | null;
  // Generic numeric counter displayed on the card (e.g., +1 counters)
  counters?: number | null; // absent/0 => no counter badge
  damage?: number | null;
  faceDown?: boolean; // Card is flipped face-down (hidden from opponent)
};
export type Permanents = Record<CellKey, PermanentItem[]>;

// --- Magic Interaction (casting) -------------------------------------------------

export type MagicTarget =
  | { kind: "location"; at: CellKey }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "avatar"; seat: PlayerKey }
  | {
      kind: "projectile";
      direction: "N" | "E" | "S" | "W";
      firstHit?: { kind: "permanent" | "avatar"; at: CellKey; index?: number };
      intended?:
        | { kind: "permanent"; at: CellKey; index: number }
        | { kind: "avatar"; seat: PlayerKey };
    };

export type PendingMagic = {
  id: string;
  tile: { x: number; y: number };
  // The spell card placed on board for UX; resolved to cemetery on completion
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  caster?:
    | { kind: "avatar"; seat: PlayerKey }
    | { kind: "permanent"; at: CellKey; index: number; owner: 1 | 2 }
    | null;
  target?: MagicTarget | null;
  status:
    | "choosingCaster"
    | "choosingTarget"
    | "confirm"
    | "resolving"
    | "cancelled"
    | "resolved";
  hints?: {
    scope: "here" | "adjacent" | "nearby" | "global" | "projectile" | null;
    allow: { location?: boolean; permanent?: boolean; avatar?: boolean };
  } | null;
  createdAt: number;
  summaryText?: string | null;
  guidesSuppressed?: boolean | null;
};

// --- Chaos Twister Minigame State ------------------------------------------------
export type ChaosTwisterPhase =
  | "selectingMinion"
  | "selectingSite"
  | "minigame"
  | "resolving"
  | "complete";

export type ChaosTwisterAccuracy = "green" | "yellow" | "red";

export type PendingChaosTwister = {
  id: string;
  // The spell card on the board
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // The caster (player who played the spell)
  casterSeat: PlayerKey;
  // Phase of the minigame
  phase: ChaosTwisterPhase;
  // Selected target minion
  targetMinion: {
    at: CellKey;
    index: number;
    card: CardRef;
    power: number; // The minion's attack power for damage calculation
  } | null;
  // Selected destination site
  targetSite: {
    x: number;
    y: number;
    cellKey: CellKey;
  } | null;
  // Minigame result
  minigameResult: {
    accuracy: ChaosTwisterAccuracy;
    hitPosition: number; // 0-100 where the slider stopped
    landingOffset: number; // 0 = exact, 1 = one tile off, 2 = two tiles off
  } | null;
  // Final landing site after offset calculation
  landingSite: {
    x: number;
    y: number;
    cellKey: CellKey;
  } | null;
  // Synced slider position for opponent to see (0-100)
  sliderPosition?: number;
  createdAt: number;
};

// --- Browse Spell State ------------------------------------------------
// "Look at your next seven spells. Put one in your hand and the rest on the bottom of your spellbook in any order."
export type BrowsePhase =
  | "viewing" // Player is viewing the 7 cards
  | "ordering" // Player is ordering the remaining cards for bottom of spellbook
  | "resolving"
  | "complete";

export type PendingBrowse = {
  id: string;
  // The spell card on the board
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // The caster (player who played the spell)
  casterSeat: PlayerKey;
  // Phase of the Browse flow
  phase: BrowsePhase;
  // The 7 cards revealed from spellbook (or fewer if spellbook has less)
  revealedCards: CardRef[];
  // The card selected to put in hand (index into revealedCards)
  selectedCardIndex: number | null;
  // The order for remaining cards to go to bottom (indices into revealedCards, excluding selectedCardIndex)
  bottomOrder: number[];
  createdAt: number;
};

// --- Common Sense Spell State ------------------------------------------------
// "Search your spellbook for an Ordinary card, reveal it, and put it into your hand. Shuffle your spellbook."
export type CommonSensePhase = "selecting" | "resolving" | "complete";

export type PendingCommonSense = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: CommonSensePhase;
  // All Ordinary cards in spellbook that can be selected
  eligibleCards: CardRef[];
  // Index of selected card in eligibleCards array
  selectedCardIndex: number | null;
  createdAt: number;
};

// --- Call to War Spell State ------------------------------------------------
// "Search your spellbook for an Exceptional Mortal, reveal it, and put it into your hand. Shuffle your spellbook."
export type CallToWarPhase = "loading" | "selecting" | "resolving" | "complete";

export type PendingCallToWar = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: CallToWarPhase;
  // All Exceptional Mortal cards in spellbook that can be selected
  eligibleCards: CardRef[];
  // Index of selected card in eligibleCards array
  selectedCardIndex: number | null;
  createdAt: number;
};

// --- Searing Truth Spell State ------------------------------------------------
// "Target player draws and reveals two spells, then takes damage equal to the higher mana cost."
export type SearingTruthPhase =
  | "selectingTarget"
  | "revealing"
  | "resolving"
  | "complete";

export type PendingSearingTruth = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: SearingTruthPhase;
  // Target player who will draw and take damage
  targetSeat: PlayerKey | null;
  // The two cards drawn (visible to both players during reveal)
  revealedCards: CardRef[];
  // The damage that will be dealt (higher mana cost)
  damageAmount: number;
  createdAt: number;
};

// --- Accusation Spell State ------------------------------------------------
// "Target opponent reveals their hand and banishes a card. If any of their cards or allies are Evil, you may choose which."
export type AccusationPhase =
  | "revealing"
  | "selecting"
  | "resolving"
  | "complete";

export type PendingAccusation = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: AccusationPhase;
  // The opponent whose hand is revealed
  victimSeat: PlayerKey;
  // The revealed hand (visible to caster during selection)
  revealedHand: CardRef[];
  // Whether caster has choice (if any Evil cards/allies)
  casterHasChoice: boolean;
  // Indices of Evil cards in the revealed hand
  evilCardIndices: number[];
  // Index of selected card to banish
  selectedCardIndex: number | null;
  createdAt: number;
};

// --- Earthquake Spell State ------------------------------------------------
// "You may rearrange sites within a two-by-two area, carrying along everything of normal size.
//  Then burrow all minions and artifacts on those sites."
export type EarthquakePhase =
  | "selectingArea" // Player is selecting the top-left corner of a 2x2 area
  | "rearranging" // Player is rearranging sites within the 2x2 area
  | "resolving"
  | "complete";

export type EarthquakeSwap = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type PendingEarthquake = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: EarthquakePhase;
  // Top-left corner of the 2x2 area (null if not yet selected)
  areaCorner: { x: number; y: number } | null;
  // List of swaps performed during rearranging phase
  swaps: EarthquakeSwap[];
  // Sites in the 2x2 area that will be burrowed after rearranging
  affectedCells: CellKey[];
  createdAt: number;
};

// --- Pith Imp Private Hand State ------------------------------------------------
// "Genesis → Steals a random spell from your opponent's hand until it leaves the realm."
// Uses private hand approach like Omphalos - stolen cards stored in hand array (face-down/hidden)
export type PithImpHandEntry = {
  id: string;
  // The Pith Imp minion that has this private hand
  minion: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // Who played the Pith Imp
  ownerSeat: PlayerKey;
  // Original owner of the stolen card (victim)
  victimSeat: PlayerKey;
  // The private hand of stolen cards (face-down/hidden from victim)
  hand: CardRef[];
  createdAt: number;
};

// Legacy type for backwards compatibility
export type PendingStolenCard = {
  id: string;
  minion: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  ownerSeat: PlayerKey;
  stolenCard: CardRef;
  victimSeat: PlayerKey;
  createdAt: number;
};

// --- Morgana le Fay Private Hand State ------------------------------------------------
// "Genesis → Morgana draws her own hand of three spells, which only she can cast."
export type MorganaHandEntry = {
  id: string;
  // The Morgana minion that has this private hand
  minion: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // Who played Morgana
  ownerSeat: PlayerKey;
  // The private hand of spells (up to 3)
  hand: CardRef[];
  createdAt: number;
};

// --- Omphalos Private Hand State ------------------------------------------------
// "At the end of your turn, this Omphalos draws a spell, which only it can cast.
//  Minions it casts must be summoned here."
export type OmphalosHandEntry = {
  id: string;
  // The Omphalos artifact that has this private hand
  artifact: {
    at: CellKey;
    index: number;
    instanceId?: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  // Who played the Omphalos
  ownerSeat: PlayerKey;
  // The private hand of spells (grows by 1 each end of turn)
  hand: CardRef[];
  createdAt: number;
};

// --- Lilith State ------------------------------------------------
// "At the end of your turn, reveal opponent's top spell. If it's a minion, summon it here. Otherwise, put it at the bottom of the deck."
export type LilithRevealPhase = "revealing" | "resolving" | "complete";

export type PendingLilithReveal = {
  id: string;
  lilithInstanceId: string;
  lilithLocation: CellKey;
  lilithOwner: PlayerKey;
  phase: LilithRevealPhase;
  revealedCard: CardRef | null;
  isMinion: boolean;
  createdAt: number;
};

export type LilithEntry = {
  id: string;
  instanceId: string;
  location: CellKey;
  ownerSeat: PlayerKey;
  cardName: string;
};

// --- Mother Nature State ------------------------------------------------
// "At the start of your turn, reveal your topmost spell. If it's a minion, you may summon it here."
export type MotherNatureRevealPhase =
  | "revealing"
  | "choosing"
  | "resolving"
  | "complete";

export type PendingMotherNatureReveal = {
  id: string;
  motherNatureInstanceId: string;
  motherNatureLocation: string;
  ownerSeat: PlayerKey;
  phase: MotherNatureRevealPhase;
  revealedCard: CardRef | null;
  isMinion: boolean;
  createdAt: number;
};

export type MotherNatureEntry = {
  id: string;
  instanceId: string;
  location: string;
  ownerSeat: PlayerKey;
  cardName: string;
};

// --- Black Mass State ------------------------------------------------
// "Search your top seven spells. You may reveal and draw three different Evil minions from among them. Put the rest at the bottom of your spellbook."
export type BlackMassPhase = "loading" | "selecting" | "resolving" | "complete";

export type PendingBlackMass = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: BlackMassPhase;
  topSevenCards: CardRef[];
  eligibleIndices: number[]; // Evil minions only
  allMinionIndices: number[]; // All minions (for checkbox toggle)
  selectedIndices: number[];
  createdAt: number;
};

// --- Highland Princess State ------------------------------------------------
// Genesis → Search your spellbook for an artifact that costs ① or less, reveal it, and put it into your hand. Shuffle.
export type HighlandPrincessPhase = "loading" | "selecting" | "complete";

export type PendingHighlandPrincess = {
  id: string;
  minion: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  ownerSeat: PlayerKey;
  phase: HighlandPrincessPhase;
  eligibleCards: CardRef[];
  selectedCard: CardRef | null;
  createdAt: number;
};

// --- Assorted Animals State ------------------------------------------------
// Search your spellbook for different Beasts with a combined mana cost of X or less, reveal them, and put them in your hand. Shuffle.
export type AssortedAnimalsPhase =
  | "choosing_x"
  | "loading"
  | "selecting"
  | "complete";

export type PendingAssortedAnimals = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: AssortedAnimalsPhase;
  maxMana: number; // Maximum mana available to spend on X
  xValue: number;
  eligibleCards: Array<CardRef & { cost: number }>;
  selectedCards: Array<CardRef & { cost: number }>;
  createdAt: number;
};

// --- Frontier Settlers State ------------------------------------------------
// Tap → Reveal and play your topmost site to an adjacent void or Rubble. Frontier Settlers move there and lose this ability.
export type FrontierSettlersPhase =
  | "revealing"
  | "selecting_target"
  | "complete";

export type PendingFrontierSettlers = {
  id: string;
  minion: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  ownerSeat: PlayerKey;
  phase: FrontierSettlersPhase;
  revealedSite: CardRef | null;
  validTargets: CellKey[];
  selectedTarget: CellKey | null;
  createdAt: number;
};

// --- Pigs of the Sounder / Squeakers State ------------------------------------
// Deathrite abilities that reveal 5 spells and summon matching cards:
// - "Pigs of the Sounder" → summons "Grand Old Boars"
// - "Squeakers" → summons "Pigs of the Sounder"
export type PigsOfTheSounderPhase = "revealing" | "summoning" | "complete";

export type PendingPigsOfTheSounder = {
  id: string;
  ownerSeat: PlayerKey;
  deathLocation: CellKey;
  triggerCardName: string; // Card that triggered the Deathrite
  targetCardName: string; // Card to search for and summon
  phase: PigsOfTheSounderPhase;
  revealedCards: CardRef[];
  pigsToSummon: CardRef[]; // Cards matching targetCardName
  cardsToBottom: CardRef[];
  createdAt: number;
};

// --- Demonic Contract State ------------------------------------------------
// Search spellbook with rarity limited by highest Demon controlled; pay 4 life or sacrifice token
export type DemonicContractPhase =
  | "choosing_cost"
  | "choosing_sacrifice"
  | "loading"
  | "selecting"
  | "complete";

export type DemonicContractCostType = "life" | "sacrifice";

export type PendingDemonicContract = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: DemonicContractPhase;
  maxRarity: number;
  highestDemonName: string | null;
  costType: DemonicContractCostType | null;
  sacrificeOptions: Array<{
    at: CellKey;
    index: number;
    name: string;
    instanceId: string | null;
  }>;
  selectedSacrifice: { at: CellKey; index: number } | null;
  eligibleCards: CardRef[];
  selectedCard: CardRef | null;
  createdAt: number;
};

// --- Doomsday Cult State ----------------------------------------------
// Continuous effect: reveal top spellbook, allow Evil casting from spellbook
export type DoomsdayCultInfo = {
  at: CellKey;
  owner: PlayerKey;
  index: number;
};

// --- Dhol Chants State ------------------------------------------------
// Tap N allies to reveal N spells, cast one for free, put rest at bottom
export type DholChantsPhase =
  | "selecting_allies"
  | "revealing"
  | "selecting_spell"
  | "complete";

export type DholChantsAlly = {
  at: CellKey;
  index: number;
  instanceId: string | null;
  name: string;
  tapped: boolean;
};

export type PendingDholChants = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: DholChantsPhase;
  nearbyAllies: DholChantsAlly[];
  selectedAllies: Array<{ at: CellKey; index: number }>;
  revealedSpells: CardRef[];
  selectedSpell: CardRef | null;
  createdAt: number;
};

// Context menu targeting for click-driven actions
export type ContextMenuTarget =
  | { kind: "site"; x: number; y: number }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "avatar"; who: PlayerKey }
  | {
      kind: "pile";
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard" | "collection";
    }
  | { kind: "tokenpile"; who: PlayerKey };

export type GameEvent = {
  id: number;
  ts: number;
  text: string;
  turn?: number;
  player?: 1 | 2;
};
export const MAX_EVENTS = 200;
export const BOARD_PING_LIFETIME_MS = 2500;
export const BOARD_PING_MAX_HISTORY = 8;

// Snapshot of serializable game state we can restore on undo
export type SerializedGame = {
  actorKey: PlayerKey | null;
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  turn: number;
  phase: Phase;
  d20Rolls: Record<PlayerKey, number | null>;
  setupWinner: PlayerKey | null;
  board: BoardState;
  showGridOverlay: boolean;
  showPlaymat: boolean;
  cameraMode: "orbit" | "topdown";
  zones: Record<PlayerKey, Zones>;
  selectedCard: { who: PlayerKey; index: number; card: CardRef } | null;
  selectedPermanent: { at: CellKey; index: number } | null;
  avatars: Record<PlayerKey, AvatarState>;
  permanents: Permanents;
  mulligans: Record<PlayerKey, number>;
  mulliganDrawn: Record<PlayerKey, CardRef[]>;
  permanentPositions: GameState["permanentPositions"];
  permanentAbilities: GameState["permanentAbilities"];
  sitePositions: GameState["sitePositions"];
  playerPositions: GameState["playerPositions"];
  events: GameEvent[];
  eventSeq: number;
  portalState: PortalState | null;
};

export type GameState = {
  players: Record<PlayerKey, PlayerState>;
  currentPlayer: 1 | 2;
  turn: number;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  // Track if current player has drawn their card this turn (for Draw phase enforcement)
  hasDrawnThisTurn: boolean;
  setHasDrawnThisTurn: (drawn: boolean) => void;
  // D20 Setup phase
  d20Rolls: Record<PlayerKey, number | null>;
  rollD20: (who: PlayerKey) => void;
  setupWinner: PlayerKey | null;
  choosePlayerOrder: (winner: PlayerKey, wantsToGoFirst: boolean) => void;
  // D20 pending roll for retry logic
  d20PendingRoll: { seat: PlayerKey; roll: number; ts: number } | null;
  retryD20Roll: () => boolean;
  clearD20Pending: () => void;
  // Server patch integration
  applyServerPatch: (patch: unknown, t?: number) => void;
  applyPatch: (patch: unknown) => void;
  lastServerTs: number;
  // Timestamp of the last local action we attempted to send to server
  lastLocalActionTs: number;
  // Multiplayer transport (null => offline)
  transport: GameTransport | null;
  setTransport: (t: GameTransport | null) => void;
  // Current online match id (null offline). Used for per-match persistence.
  matchId: string | null;
  setMatchId: (id: string | null) => void;
  // Local seat/actor (only set in online play UI; null in offline)
  actorKey: PlayerKey | null;
  setActorKey: (key: PlayerKey | null) => void;
  localPlayerId: string | null;
  setLocalPlayerId: (id: string | null) => void;
  opponentPlayerId: string | null;
  setOpponentPlayerId: (id: string | null) => void;
  // Match end detection
  matchEnded: boolean;
  winner: PlayerKey | null;
  checkMatchEnd: () => void;
  // Manual tie declaration when both players are at Death's Door
  tieGame: () => void;
  // Cross-turn interactions
  interactionLog: InteractionStateMap;
  pendingInteractionId: string | null;
  acknowledgedInteractionIds: Record<string, true>;
  activeInteraction: InteractionRequestEntry | null;
  sendInteractionRequest: (input: SendInteractionRequestInput) => void;
  receiveInteractionEnvelope: (
    envelope: InteractionEnvelope | InteractionMessage
  ) => void;
  // New: handle server-executed interaction outcomes
  receiveInteractionResult: (message: InteractionResultMessage) => void;
  respondToInteraction: (
    requestId: string,
    decision: InteractionDecision,
    actorId: string,
    options?: InteractionResponseOptions
  ) => void;
  expireInteraction: (requestId: string) => void;
  clearInteraction: (requestId: string) => void;
  transportSubscriptions: Array<() => void>;
  // Feature flag: opt-in guided overlays for combat interactions (local preference)
  interactionGuides: boolean;
  setInteractionGuides: (on: boolean) => void;
  // Feature flag: opt-in guided overlays for magic casting (local preference)
  magicGuides: boolean;
  setMagicGuides: (on: boolean) => void;
  // Per-seat guide preferences (match scope; used to derive effective flags)
  combatGuideSeatPrefs: Record<PlayerKey, boolean>;
  magicGuideSeatPrefs: Record<PlayerKey, boolean>;
  // Effective guide state: enabled only when both seats have their toggles on
  combatGuidesActive: boolean;
  magicGuidesActive: boolean;
  // Action notifications (toasts for play/draw/move actions)
  actionNotifications: boolean;
  setActionNotifications: (on: boolean) => void;
  // Card previews toggle (show/hide card preview overlay on hover)
  cardPreviewsEnabled: boolean;
  setCardPreviewsEnabled: (on: boolean) => void;
  toggleCardPreviews: () => void;
  // Card meta cache (subset) used to detect base power and rarity
  metaByCardId: Record<
    number,
    {
      attack: number | null;
      defence: number | null;
      cost: number | null;
      rarity: string | null;
      type: string | null;
      subTypes: string | null;
    }
  >;
  fetchCardMeta: (ids: number[]) => Promise<void>;
  // Pending combat (MVP)
  pendingCombat: {
    id: string;
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean; // True if attacker is an avatar
      avatarSeat?: PlayerKey; // Which player's avatar
    };
    target?: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    } | null;
    defenderSeat: PlayerKey | null;
    defenders: Array<{
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
    }>;
    status: "declared" | "defending" | "committed" | "resolved" | "cancelled";
    assignment?: Array<{ at: CellKey; index: number; amount: number }> | null;
    createdAt: number;
  } | null;
  // HUD-driven combat UI (lifted from Board for layout-level overlays)
  attackChoice: {
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean; // True if attacker is an avatar
      avatarSeat?: PlayerKey; // Which player's avatar
    };
    attackerName?: string | null;
  } | null;
  attackTargetChoice: {
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    };
    candidates: Array<{
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
      label: string;
    }>;
  } | null;
  attackConfirm: {
    tile: { x: number; y: number };
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    };
    target: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    };
    targetLabel: string;
  } | null;
  setAttackChoice: (v: GameState["attackChoice"]) => void;
  setAttackTargetChoice: (v: GameState["attackTargetChoice"]) => void;
  setAttackConfirm: (v: GameState["attackConfirm"]) => void;
  // Signal Board to revert last cross-tile move (handled locally there)
  revertCrossMoveTick: number;
  requestRevertCrossMove: () => void;
  lastCombatSummary: {
    id: string;
    text: string;
    ts: number;
    actor?: PlayerKey;
    targetSeat?: PlayerKey;
  } | null;
  setLastCombatSummary: (
    smm: {
      id: string;
      text: string;
      ts: number;
      actor?: PlayerKey;
      targetSeat?: PlayerKey;
    } | null
  ) => void;
  declareAttack: (
    tile: { x: number; y: number },
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    },
    target?: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    } | null
  ) => void;
  // Trigger an intercept offer after a Move Only action by the attacker
  offerIntercept: (
    tile: { x: number; y: number },
    attacker: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      isAvatar?: boolean;
      avatarSeat?: PlayerKey;
    }
  ) => void;
  setDefenderSelection: (
    defenders: Array<{
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
    }>
  ) => void;
  commitDefenders: () => void;
  setDamageAssignment: (
    asgn: Array<{ at: CellKey; index: number; amount: number }>
  ) => boolean;
  resolveCombat: () => void;
  autoResolveCombat: () => void;
  cancelCombat: () => void;
  applyDamageToPermanent: (at: CellKey, index: number, amount: number) => void;
  clearAllDamageForSeat: (seat: PlayerKey) => void;
  setTapPermanent: (at: CellKey, index: number, tapped: boolean) => void;
  // Magic casting flow (MVP)
  pendingMagic: PendingMagic | null;
  // Animist cast choice (choose magic or spirit mode)
  pendingAnimistCast: PendingAnimistCast | null;
  beginAnimistCast: (input: {
    card: CardRef;
    manaCost: number;
    cellKey: CellKey;
    handIndex: number;
    casterSeat: PlayerKey;
  }) => void;
  resolveAnimistCast: (mode: AnimistCastMode) => void;
  cancelAnimistCast: () => void;
  // Chaos Twister minigame flow
  pendingChaosTwister: PendingChaosTwister | null;
  beginChaosTwister: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => void;
  selectChaosTwisterMinion: (minion: {
    at: CellKey;
    index: number;
    card: CardRef;
    power: number;
  }) => void;
  selectChaosTwisterSite: (site: { x: number; y: number }) => void;
  completeChaosTwisterMinigame: (result: {
    accuracy: ChaosTwisterAccuracy;
    hitPosition: number;
  }) => void;
  resolveChaosTwister: () => void;
  cancelChaosTwister: () => void;
  // Browse spell flow
  pendingBrowse: PendingBrowse | null;
  beginBrowse: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => void;
  selectBrowseCard: (cardIndex: number) => void;
  setBrowseBottomOrder: (order: number[]) => void;
  resolveBrowse: () => void;
  cancelBrowse: () => void;
  // Common Sense spell flow
  pendingCommonSense: PendingCommonSense | null;
  beginCommonSense: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => Promise<void>;
  selectCommonSenseCard: (cardIndex: number) => void;
  resolveCommonSense: () => void;
  cancelCommonSense: () => void;
  // Call to War spell flow
  pendingCallToWar: PendingCallToWar | null;
  beginCallToWar: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => Promise<void>;
  selectCallToWarCard: (cardIndex: number) => void;
  resolveCallToWar: () => void;
  cancelCallToWar: () => void;
  // Searing Truth spell flow
  pendingSearingTruth: PendingSearingTruth | null;
  beginSearingTruth: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => void;
  selectSearingTruthTarget: (targetSeat: PlayerKey) => Promise<void>;
  resolveSearingTruth: () => void;
  cancelSearingTruth: () => void;
  // Accusation spell flow
  pendingAccusation: PendingAccusation | null;
  beginAccusation: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => Promise<void>;
  selectAccusationCard: (cardIndex: number) => void;
  resolveAccusation: () => void;
  cancelAccusation: () => void;
  // Earthquake spell flow
  pendingEarthquake: PendingEarthquake | null;
  beginEarthquake: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => void;
  selectEarthquakeArea: (corner: { x: number; y: number }) => void;
  performEarthquakeSwap: (
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => void;
  resolveEarthquake: () => void;
  cancelEarthquake: () => void;
  // Pith Imp private hands (stolen cards, hidden/face-down)
  pithImpHands: PithImpHandEntry[];
  stolenCards: PendingStolenCard[]; // Legacy - kept for backwards compatibility
  processedPithImpReturns?: Set<string>; // Deduplication tracking for pithImpReturn messages
  triggerPithImpGenesis: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => void;
  returnStolenCard: (
    minionInstanceId: string | null,
    minionAt: CellKey
  ) => void;
  removePithImpHand: (
    minionInstanceId: string | null,
    minionAt: CellKey
  ) => void;
  getPithImpHandForMinion: (
    minionInstanceId: string | null,
    minionAt: CellKey
  ) => CardRef[];
  dropStolenCard: (
    pithImpId: string,
    cardIndex: number,
    targetTile: { x: number; y: number }
  ) => void;
  // Morgana le Fay private hands
  morganaHands: MorganaHandEntry[];
  triggerMorganaGenesis: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => void;
  castFromMorganaHand: (
    morganaId: string,
    cardIndex: number,
    targetTile: { x: number; y: number }
  ) => void;
  removeMorganaHand: (
    minionInstanceId: string | null,
    minionAt: CellKey
  ) => void;
  getMorganaHandForMinion: (
    minionInstanceId: string | null,
    minionAt: CellKey
  ) => CardRef[];
  // Omphalos private hands (artifacts that draw spells at end of turn)
  omphalosHands: OmphalosHandEntry[];
  registerOmphalos: (input: {
    artifact: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => void;
  triggerOmphalosEndOfTurn: (endingPlayerSeat: PlayerKey) => void;
  castFromOmphalosHand: (
    omphalosId: string,
    cardIndex: number,
    targetTile: { x: number; y: number }
  ) => void;
  removeOmphalosHand: (
    artifactInstanceId: string | null,
    artifactAt: CellKey
  ) => void;
  getOmphalosHandForArtifact: (
    artifactInstanceId: string | null,
    artifactAt: CellKey
  ) => CardRef[];
  // Lilith minions (end of turn: reveal opponent's top spell, summon if minion)
  lilithMinions: LilithEntry[];
  pendingLilithReveal: PendingLilithReveal | null;
  registerLilith: (input: {
    instanceId: string;
    location: CellKey;
    ownerSeat: PlayerKey;
    cardName: string;
  }) => void;
  unregisterLilith: (instanceId: string) => void;
  triggerLilithEndOfTurn: (endingPlayerSeat: PlayerKey) => Promise<void>;
  resolveLilithReveal: () => void;
  cancelLilithReveal: () => void;
  // Mother Nature minions (start of turn: reveal your top spell, may summon if minion)
  motherNatureMinions: MotherNatureEntry[];
  pendingMotherNatureReveal: PendingMotherNatureReveal | null;
  registerMotherNature: (input: {
    instanceId: string;
    location: string;
    ownerSeat: PlayerKey;
    cardName: string;
  }) => void;
  unregisterMotherNature: (instanceId: string) => void;
  triggerMotherNatureStartOfTurn: (startingPlayerSeat: PlayerKey) => void;
  acceptMotherNatureSummon: () => void;
  declineMotherNatureSummon: () => void;
  // Black Mass spell (search top 7, draw up to 3 Evil minions)
  pendingBlackMass: PendingBlackMass | null;
  beginBlackMass: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => Promise<void>;
  selectBlackMassCard: (index: number) => void;
  deselectBlackMassCard: (index: number) => void;
  resolveBlackMass: () => void;
  cancelBlackMass: () => void;
  // Highland Princess (Genesis: search artifact ≤1 cost)
  pendingHighlandPrincess: PendingHighlandPrincess | null;
  triggerHighlandPrincessGenesis: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => Promise<void>;
  selectHighlandPrincessCard: (card: CardRef) => void;
  resolveHighlandPrincess: () => void;
  cancelHighlandPrincess: () => void;
  // Assorted Animals (search Beasts with combined cost ≤ X)
  pendingAssortedAnimals: PendingAssortedAnimals | null;
  beginAssortedAnimals: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
    xValue: number;
  }) => Promise<void>;
  setAssortedAnimalsX: (xValue: number) => Promise<void>;
  selectAssortedAnimalsCard: (card: CardRef & { cost: number }) => void;
  deselectAssortedAnimalsCard: (cardId: number) => void;
  resolveAssortedAnimals: () => void;
  cancelAssortedAnimals: () => void;
  // Frontier Settlers (tap: reveal/play top site to adjacent void/rubble)
  pendingFrontierSettlers: PendingFrontierSettlers | null;
  frontierSettlersUsed: Set<string>;
  triggerFrontierSettlersAbility: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => void;
  selectFrontierSettlersTarget: (targetCell: CellKey) => void;
  resolveFrontierSettlers: () => void;
  cancelFrontierSettlers: () => void;
  hasFrontierSettlersAbility: (instanceId: string) => boolean;
  // Pigs of the Sounder / Squeakers (Deathrite: reveal 5, summon matching cards)
  pendingPigsOfTheSounder: PendingPigsOfTheSounder | null;
  triggerPigsDeathrite: (input: {
    ownerSeat: PlayerKey;
    deathLocation: CellKey;
    triggerCardName?: string; // Optional: defaults to "Pigs of the Sounder"
  }) => void;
  resolvePigsOfTheSounder: () => void;
  cancelPigsOfTheSounder: () => void;
  // Demonic Contract (search with Demon rarity limit, pay life or sacrifice)
  pendingDemonicContract: PendingDemonicContract | null;
  beginDemonicContract: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => Promise<void>;
  chooseDemonicContractCost: (costType: "life" | "sacrifice") => Promise<void>;
  selectDemonicContractSacrifice: (at: CellKey, index: number) => Promise<void>;
  selectDemonicContractCard: (card: CardRef) => void;
  resolveDemonicContract: () => void;
  cancelDemonicContract: () => void;
  // Dhol Chants (tap N allies, reveal N spells, cast one free)
  pendingDholChants: PendingDholChants | null;
  beginDholChants: (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => void;
  toggleDholChantsAlly: (at: CellKey, index: number) => void;
  confirmDholChantsAllies: () => void;
  selectDholChantsSpell: (card: CardRef) => void;
  resolveDholChants: () => void;
  cancelDholChants: () => void;
  // Doomsday Cult (continuous: reveal top spellbook, cast Evil from spellbook)
  getActiveDoomsdayCults: () => DoomsdayCultInfo[];
  isDoomsdayCultActive: () => boolean;
  getRevealedSpellbookTop: (playerKey: PlayerKey) => CardRef | null;
  canCastFromSpellbookTop: (
    playerKey: PlayerKey,
    targetCell: CellKey
  ) => { canCast: boolean; reason?: string; card?: CardRef };
  castFromSpellbookTop: (
    playerKey: PlayerKey,
    targetCell: CellKey
  ) => CardRef | false;
  // Pending cast from Morgana/Omphalos hands (for tile targeting)
  pendingPrivateHandCast: {
    kind: "morgana" | "omphalos";
    handId: string;
    cardIndex: number;
    card: CardRef;
    mustCastAtLocation?: CellKey; // For Omphalos minions
  } | null;
  setPendingPrivateHandCast: (
    pending: {
      kind: "morgana" | "omphalos";
      handId: string;
      cardIndex: number;
      card: CardRef;
      mustCastAtLocation?: CellKey;
    } | null
  ) => void;
  completePendingPrivateHandCast: (targetTile: {
    x: number;
    y: number;
  }) => void;
  beginMagicCast: (input: {
    tile: { x: number; y: number };
    spell: {
      at: CellKey;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    presetCaster?:
      | { kind: "avatar"; seat: PlayerKey }
      | { kind: "permanent"; at: CellKey; index: number; owner: 1 | 2 }
      | null;
  }) => void;
  setMagicCasterChoice: (
    caster:
      | { kind: "avatar"; seat: PlayerKey }
      | { kind: "permanent"; at: CellKey; index: number; owner: 1 | 2 }
      | null
  ) => void;
  setMagicTargetChoice: (target: MagicTarget | null) => void;
  confirmMagic: () => void;
  resolveMagic: () => void;
  cancelMagic: () => void;
  // Generic lightweight message handler
  receiveCustomMessage: (msg: CustomMessage) => void;
  // Safe patch sending
  pendingPatches: ServerPatchT[];
  trySendPatch: (patch: ServerPatchT) => boolean;
  // D20 patches bypass batching and send immediately for reliability
  trySendD20Patch: (patch: ServerPatchT) => boolean;
  flushPendingPatches: () => void;
  addLife: (who: PlayerKey, delta: number) => void;
  addMana: (who: PlayerKey, delta: number) => void;
  addThreshold: (
    who: PlayerKey,
    element: keyof Thresholds,
    delta: number
  ) => void;
  nextPhase: () => void; // legacy manual stepping
  endTurn: () => void; // auto-resolve to next player's Main
  // Board
  board: BoardState;
  showGridOverlay: boolean;
  showPlaymat: boolean;
  showPlaymatOverlay: boolean;
  playmatUrl: string | null;
  playmatUrls: Record<PlayerKey, string | null>; // Per-player custom playmat URLs
  activePlaymatOwner: PlayerKey | null; // Which player's playmat is currently shown (null = use own)
  cardbackUrls: Record<
    PlayerKey,
    { spellbook: string | null; atlas: string | null; preset: string | null }
  >;
  gridColor: "white" | "black";
  gridBlend: "normal" | "subtract";
  allowSiteDrag: boolean;
  showOwnershipOverlay: boolean;
  cardScale: number; // Scale factor for cards on board (0.25 to 1)
  draggingSite: {
    sourceKey: CellKey;
    site: SiteTile;
    worldPos: { x: number; z: number };
  } | null;
  setPlaymatUrl: (url: string) => void;
  setPlaymatUrlFor: (who: PlayerKey, url: string | null) => void;
  setActivePlaymatOwner: (who: PlayerKey | null) => void;
  setCardbackUrls: (
    who: PlayerKey,
    spellbook: string | null,
    atlas: string | null,
    preset?: string | null
  ) => void;
  setGridColor: (color: "white" | "black") => void;
  setGridBlend: (blend: "normal" | "subtract") => void;
  togglePlaymatOverlay: () => void;
  toggleAllowSiteDrag: () => void;
  toggleOwnershipOverlay: () => void;
  setCardScale: (scale: number) => void;
  setDraggingSite: (
    dragging: {
      sourceKey: CellKey;
      site: SiteTile;
      worldPos: { x: number; z: number };
    } | null
  ) => void;
  updateDraggingSitePos: (x: number, z: number) => void;
  dropDraggingSite: (targetX: number, targetY: number) => void;
  // Camera / view mode
  cameraMode: "orbit" | "topdown";
  setCameraMode: (mode: "orbit" | "topdown") => void;
  toggleCameraMode: () => void;
  toggleGridOverlay: () => void;
  togglePlaymat: () => void;
  toggleTapSite: (x: number, y: number) => void;
  // Zones and actions
  zones: Record<PlayerKey, Zones>;
  initLibraries: (
    who: PlayerKey,
    spellbook: CardRef[],
    atlas: CardRef[],
    collection?: CardRef[]
  ) => void;
  shuffleSpellbook: (who: PlayerKey) => void;
  shuffleAtlas: (who: PlayerKey) => void;
  drawFrom: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count?: number
  ) => void;
  drawFromBottom: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count?: number
  ) => void;
  scryTop: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    decision: "top" | "bottom"
  ) => void;
  scryMany: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count: number,
    bottomIndexes: number[]
  ) => void;
  drawOpening: (
    who: PlayerKey,
    spellbookCount?: number,
    atlasCount?: number
  ) => void;
  selectedCard: { who: PlayerKey; index: number; card: CardRef } | null;
  selectedPermanent: { at: CellKey; index: number } | null;
  selectedAvatar: PlayerKey | null;
  // Hand visibility state
  mouseInHandZone: boolean;
  handHoverCount: number;
  // null = default hover, "hidden" = force hidden, "visible" = force fully visible
  handVisibilityMode: "hidden" | "visible" | null;
  setMouseInHandZone: (inZone: boolean) => void;
  setHandHoverCount: (count: number) => void;
  setHandVisibilityMode: (mode: "hidden" | "visible" | null) => void;
  toggleHandVisibility: () => void;
  selectHandCard: (who: PlayerKey, index: number) => void;
  selectAvatar: (who: PlayerKey) => void;
  clearSelection: () => void;
  playSelectedTo: (x: number, y: number) => void;
  playFromPileTo: (x: number, y: number) => void;
  drawFromPileToHand: () => void;
  moveCardFromHandToPile: (
    who: PlayerKey,
    pile: "spellbook" | "atlas",
    position: "top" | "bottom"
  ) => void;
  selectPermanent: (at: CellKey, index: number) => void;
  moveSelectedPermanentTo: (x: number, y: number) => void;
  moveSelectedPermanentToWithOffset: (
    x: number,
    y: number,
    offset: [number, number]
  ) => void;
  setPermanentOffset: (
    at: CellKey,
    index: number,
    offset: [number, number]
  ) => void;
  toggleTapPermanent: (at: CellKey, index: number) => void;
  toggleFaceDown: (at: CellKey, index: number) => void;
  // Generic counters on permanents
  addCounterOnPermanent: (at: CellKey, index: number) => void; // creates or increments (1 if missing)
  incrementPermanentCounter: (at: CellKey, index: number) => void;
  decrementPermanentCounter: (at: CellKey, index: number) => void; // destroys when reaching 0
  clearPermanentCounter: (at: CellKey, index: number) => void; // remove badge entirely
  // Move cards from board back to zones
  movePermanentToZone: (
    at: CellKey,
    index: number,
    target: "hand" | "graveyard" | "banished" | "spellbook",
    position?: "top" | "bottom"
  ) => void;
  moveSiteToZone: (
    x: number,
    y: number,
    target: "hand" | "graveyard" | "banished" | "atlas",
    position?: "top" | "bottom"
  ) => void;
  moveSiteToGraveyardWithRubble: (
    x: number,
    y: number,
    placeRubble: boolean
  ) => void;
  moveFromBanishedToZone: (
    who: PlayerKey,
    instanceId: string,
    target: "hand" | "graveyard"
  ) => void;
  moveFromGraveyardToBanished: (who: PlayerKey, instanceId: string) => void;
  banishEntireGraveyard: (who: PlayerKey) => void;
  // Handle peeked card action (from peek dialog)
  handlePeekedCard: (
    who: PlayerKey,
    pile: "spellbook" | "atlas" | "hand",
    cardIndex: number,
    action: "top" | "bottom" | "hand" | "graveyard" | "banish"
  ) => void;
  // Transfer control
  transferPermanentControl: (at: CellKey, index: number, to?: 1 | 2) => void;
  transferSiteControl: (x: number, y: number, to?: 1 | 2) => void;
  // Switch site position (Earthquake, Rift Valley) - moves all permanents/avatars with the site
  switchSitePosition: (
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number
  ) => void;
  avatars: Record<PlayerKey, AvatarState>;
  permanents: Permanents;
  setAvatarCard: (who: PlayerKey, card: CardRef) => void;
  setAvatarChampion: (who: PlayerKey, champion: ChampionRef | null) => void;
  placeAvatarAtStart: (who: PlayerKey) => void;
  moveAvatarTo: (who: PlayerKey, x: number, y: number) => void;
  moveAvatarToWithOffset: (
    who: PlayerKey,
    x: number,
    y: number,
    offset: [number, number]
  ) => void;
  setAvatarOffset: (who: PlayerKey, offset: [number, number] | null) => void;
  toggleTapAvatar: (who: PlayerKey) => void;
  addCounterOnAvatar: (who: PlayerKey) => void;
  incrementAvatarCounter: (who: PlayerKey) => void;
  decrementAvatarCounter: (who: PlayerKey) => void;
  clearAvatarCounter: (who: PlayerKey) => void;
  // Harbinger Portal State (Gothic expansion)
  portalState: PortalState | null;
  initPortalState: (harbingerSeats: PlayerKey[]) => void;
  setPortalCurrentRoller: (seat: PlayerKey | null) => void;
  rollPortalDie: (seat: PlayerKey, dieIndex: number) => void;
  rerollPortalDie: (seat: PlayerKey, dieIndex: number) => void;
  finalizePortalRolls: (seat: PlayerKey) => void;
  completePortalSetup: () => void;
  // Second Player Seer State
  seerState: SeerState | null;
  initSeerState: (secondSeat: PlayerKey) => void;
  setSeerPile: (pile: "spellbook" | "atlas") => void;
  revealSeerCard: () => void;
  completeSeer: (decision: "top" | "bottom" | "skip") => void;
  // Imposter Mask State (Gothic expansion)
  // Tracks when an Imposter avatar is wearing a mask (another avatar from collection)
  imposterMasks: Record<PlayerKey, ImposterMaskState | null>;
  // Mask yourself: banish avatar from collection to become that avatar (costs 3 mana)
  maskWith: (who: PlayerKey, maskAvatar: CardRef) => boolean;
  // Unmask: banish the mask avatar and restore original Imposter
  unmask: (who: PlayerKey) => void;
  // Break mask due to damage (automatic unmask)
  breakMask: (who: PlayerKey) => void;
  // Necromancer Skeleton State (Gothic expansion)
  // Tracks whether each player has used their once-per-turn skeleton summon
  necromancerSkeletonUsed: Record<PlayerKey, boolean>;
  // Summon a skeleton token at the avatar's current position (costs 1 mana, once per turn)
  summonSkeletonHere: (who: PlayerKey) => boolean;
  // Druid Flip State (Arthurian Legends)
  // Tracks whether each player's Druid has been flipped (one-way transformation)
  druidFlipped: Record<PlayerKey, boolean>;
  // Flip the Druid avatar: tap it, change art, and summon Bruin token here
  flipDruid: (who: PlayerKey) => boolean;
  // Special Site State (Valley of Delight, Bloom sites, etc.)
  specialSiteState: SpecialSiteState;
  // Trigger element choice for Valley of Delight (shows overlay)
  triggerElementChoice: (
    cellKey: CellKey,
    siteName: string,
    owner: 1 | 2
  ) => void;
  // Complete element choice for Valley of Delight
  completeElementChoice: (element: ElementChoice) => void;
  // Cancel element choice
  cancelElementChoice: () => void;
  // Register bloom site bonus (called on Genesis)
  registerBloomBonus: (
    cellKey: CellKey,
    siteName: string,
    thresholds: Partial<{
      air: number;
      water: number;
      earth: number;
      fire: number;
    }>,
    owner: 1 | 2
  ) => void;
  // Register genesis mana bonus (called on Genesis)
  registerGenesisMana: (
    cellKey: CellKey,
    siteName: string,
    amount: number,
    owner: 1 | 2
  ) => void;
  // Clear turn-based bonuses (called at end of turn)
  clearTurnBonuses: () => void;
  // Remove site choice when site is removed from board
  removeSiteChoice: (cellKey: CellKey) => void;
  // Mulligans
  mulligans: Record<PlayerKey, number>;
  mulligan: (who: PlayerKey) => void;
  mulliganWithSelection: (who: PlayerKey, indices: number[]) => void;
  mulliganDrawn: Record<PlayerKey, CardRef[]>;
  finalizeMulligan: () => void;
  // Reset all game state to initial values (for new matches)
  resetGameState: () => void;
  // Events / console
  events: GameEvent[];
  eventSeq: number;
  log: (text: string) => void;
  boardPings: BoardPingEvent[];
  pushBoardPing: (ping: Omit<BoardPingEvent, "ts"> & { ts?: number }) => void;
  removeBoardPing: (id: string) => void;
  lastPointerWorldPos: { x: number; z: number } | null;
  setLastPointerWorldPos: (pos: { x: number; z: number } | null) => void;
  // UI cross-surface drag state
  dragFromHand: boolean;
  dragFromPile: {
    who: PlayerKey;
    from: "spellbook" | "atlas" | "graveyard" | "collection" | "tokens";
    card: CardRef | null;
  } | null;
  setDragFromHand: (on: boolean) => void;
  setDragFromPile: (
    info: {
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard" | "collection" | "tokens";
      card: CardRef | null;
    } | null
  ) => void;
  hoverCell: [number, number] | null;
  setHoverCell: (x: number, y: number) => void;
  clearHoverCell: () => void;
  // Hover preview card
  previewCard: CardRef | null;
  setPreviewCard: (card: CardRef | null) => void;
  // Context menu
  contextMenu: {
    target: ContextMenuTarget;
    screen?: { x: number; y: number };
  } | null;
  openContextMenu: (
    target: ContextMenuTarget,
    screen?: { x: number; y: number }
  ) => void;
  closeContextMenu: () => void;
  // Switch site position selection (Earthquake, Rift Valley)
  switchSiteSource: { x: number; y: number } | null;
  setSwitchSiteSource: (source: { x: number; y: number } | null) => void;
  // Placement dialog for cards to piles
  placementDialog: {
    cardName: string;
    pileName: string;
    onPlace: (position: "top" | "bottom") => void;
  } | null;
  openPlacementDialog: (
    cardName: string,
    pileName: string,
    onPlace: (position: "top" | "bottom") => void
  ) => void;
  closePlacementDialog: () => void;
  // Search dialog for pile contents
  searchDialog: {
    pileName: string;
    cards: CardRef[];
    onSelectCard: (card: CardRef) => void;
    onBanishCard?: (card: CardRef) => void;
    banishRequiresConsent?: boolean;
  } | null;
  openSearchDialog: (
    pileName: string,
    cards: CardRef[],
    onSelectCard: (card: CardRef) => void,
    options?: {
      onBanishCard?: (card: CardRef) => void;
      banishRequiresConsent?: boolean;
    }
  ) => void;
  closeSearchDialog: () => void;
  // Peek-only dialog used for reveals (with optional card actions)
  peekDialog: {
    title?: string;
    cards: CardRef[];
    source?: {
      seat: PlayerKey;
      pile: "spellbook" | "atlas" | "hand";
      from: "top" | "bottom";
    };
  } | null;
  openPeekDialog: (
    title: string,
    cards: CardRef[],
    source?: {
      seat: PlayerKey;
      pile: "spellbook" | "atlas" | "hand";
      from: "top" | "bottom";
    }
  ) => void;
  closePeekDialog: () => void;
  // Tokens
  addTokenToHand: (who: PlayerKey, name: string) => void;
  // Add arbitrary card to hand (for toolbox/debugging)
  addCardToHand: (who: PlayerKey, card: CardRef) => void;
  attachTokenToTopPermanent: (at: CellKey, index: number) => void;
  attachTokenToPermanent: (
    at: CellKey,
    tokenIndex: number,
    targetIndex: number
  ) => void;
  attachPermanentToAvatar: (
    at: CellKey,
    permanentIndex: number,
    avatarKey: PlayerKey
  ) => void;
  detachToken: (at: CellKey, index: number) => void;
  // Derived selectors (pure getters)
  getPlayerSites: (who: PlayerKey) => Array<[CellKey, SiteTile]>;
  getUntappedSitesCount: (who: PlayerKey) => number;
  getBaseMana: (who: PlayerKey) => number; // total mana from untapped sites (before spending)
  getAvailableMana: (who: PlayerKey) => number; // remaining mana (base + offset from spending)
  getThresholdTotals: (who: PlayerKey) => Thresholds;
  // History / Undo
  history: SerializedGame[];
  historyByPlayer: Record<PlayerKey, SerializedGame[]>;
  pushHistory: () => void;
  undo: () => void;
  snapshots: Array<{
    id: string;
    title: string;
    ts: number;
    includePrivate: boolean;
    kind: "auto" | "manual";
    turn: number;
    actor: PlayerKey | null;
    payload: ServerPatchT;
  }>;
  createSnapshot: (title: string, kind?: "auto" | "manual") => void;
  hydrateSnapshotsFromStorage: () => void;

  // Permanent Position Management (Burrow/Submerge)
  permanentPositions: Record<string, PermanentPosition>; // instanceId -> position
  permanentAbilities: Record<string, BurrowAbility>; // instanceId -> ability
  sitePositions: Record<number, SitePositionData>; // siteId -> position data
  playerPositions: Record<PlayerKey, PlayerPositionReference>; // player -> position

  // Position Actions
  setPermanentPosition: (
    permanentId: string,
    position: PermanentPosition
  ) => void;
  updatePermanentState: (
    permanentId: string,
    newState: PermanentPositionState
  ) => void;
  setPermanentAbility: (permanentId: string, ability: BurrowAbility) => void;
  setSitePosition: (siteId: number, positionData: SitePositionData) => void;
  setPlayerPosition: (
    playerId: PlayerKey,
    position: PlayerPositionReference
  ) => void;

  // Validation and Utilities
  canTransitionState: (
    permanentId: string,
    targetState: PermanentPositionState
  ) => boolean;
  getAvailableActions: (permanentId: string) => ContextMenuAction[];
  calculateEdgePosition: (
    tileCoords: { x: number; z: number },
    playerPos: { x: number; z: number }
  ) => { x: number; z: number };
  calculatePlacementAngle: (
    tilePos: { x: number; z: number },
    playerPos: { x: number; z: number }
  ) => number;
  // Remote cursor telemetry
  remoteCursors: Record<string, RemoteCursorState>;
  setRemoteCursor: (cursor: RemoteCursorState) => void;
  pruneRemoteCursors: (olderThanMs: number) => void;
  getRemoteHighlightColor: (
    card: { cardId?: number | null; slug?: string | null } | null | undefined,
    options?: { instanceKey?: string | null }
  ) => string | null;
};

// Typed view of server patchable fields (subset of GameState, pure data only)
export type ServerPatchT = Partial<{
  players: GameState["players"];
  currentPlayer: GameState["currentPlayer"];
  turn: GameState["turn"];
  phase: GameState["phase"];
  hasDrawnThisTurn: GameState["hasDrawnThisTurn"];
  d20Rolls: GameState["d20Rolls"];
  setupWinner: GameState["setupWinner"];
  matchEnded: GameState["matchEnded"];
  winner: GameState["winner"];
  board: GameState["board"];
  zones: GameState["zones"];
  avatars: GameState["avatars"];
  permanents: GameState["permanents"];
  mulligans: GameState["mulligans"];
  mulliganDrawn: GameState["mulliganDrawn"];
  permanentPositions: GameState["permanentPositions"];
  permanentAbilities: GameState["permanentAbilities"];
  sitePositions: GameState["sitePositions"];
  playerPositions: GameState["playerPositions"];
  events: GameState["events"];
  eventSeq: GameState["eventSeq"];
  portalState: GameState["portalState"];
  seerState: GameState["seerState"];
  imposterMasks: GameState["imposterMasks"];
  necromancerSkeletonUsed: GameState["necromancerSkeletonUsed"];
  druidFlipped: GameState["druidFlipped"];
  stolenCards: GameState["stolenCards"];
  pithImpHands: GameState["pithImpHands"];
  morganaHands: GameState["morganaHands"];
  omphalosHands: GameState["omphalosHands"];
  cardScale: GameState["cardScale"];
  specialSiteState: GameState["specialSiteState"];
  pendingEarthquake: GameState["pendingEarthquake"];
  pendingAnimistCast: GameState["pendingAnimistCast"];
  __replaceKeys: string[];
}>;
