import type { CardRef, GameState, MagicTarget, PendingMagic, PlayerKey } from "@/lib/game/store/types";

/** A trigger-order choice meaning "keep the listed order" for the rest of that batch (the list was dismissed). */
export const CPU_TRIGGERS_IN_ORDER = "__in_order__";

export type UnitTarget =
  | { kind: "avatar"; seat: PlayerKey }
  | { kind: "permanent"; at: string; index: number; instanceId?: string | null };

export type SpellOperation =
  | ProjectileOperation
  | { kind: "offerProjectile"; projectile: ProjectileOperation }
  | { kind: "damageGrid"; at: string; grid: number[][] }
  | { kind: "submergeWater" }
  | { kind: "fillRubble"; seat: PlayerKey; at: string }
  | { kind: "drawCards"; seat: PlayerKey; spells: number; sites: number }
  | { kind: "placeTreasure"; source: UnitTarget; at: string }
  | { kind: "sacrificeTreasure"; source: UnitTarget }
  | { kind: "offerDraw"; seat: PlayerKey }
  | { kind: "chooseRandom"; seat: PlayerKey; outcomes: SpellOperation[] }
  | { kind: "waveshaperFlood"; seat: PlayerKey; at: string }
  | { kind: "stunAt"; at: string }
  | { kind: "dragUnit"; target: UnitTarget; path: string[]; region: string }
  | { kind: "offerFight"; source: UnitTarget; target: UnitTarget; strikeOnly?: boolean }
  | { kind: "strike"; source: UnitTarget; target: UnitTarget }
  | { kind: "fight"; source: UnitTarget; target: UnitTarget }
  | { kind: "rollBoulder"; target: UnitTarget; direction: "N" | "E" | "S" | "W"; region: string; started?: boolean; steps?: number }
  | { kind: "dropArtifact"; target: UnitTarget }
  | { kind: "damageAtSource"; source: UnitTarget; region: string; amount: number }
  | { kind: "banishDeadFire"; seat: PlayerKey }
  | { kind: "replaceRubble"; seat: PlayerKey; at: string }
  | { kind: "strikeNearby"; source: UnitTarget }
  | { kind: "auraUpdate"; target: UnitTarget; ticks?: number; visited?: string[]; to?: string; dispel?: boolean; endKey?: string; counter?: boolean }
  | { kind: "tapUnits"; targets: UnitTarget[] }
  | { kind: "surface"; target: UnitTarget }
  | { kind: "damageEvent"; hits: DamageHit[] }
  | { kind: "summonTokens"; seat: PlayerKey; ats: string[] }
  | { kind: "destroySite"; at: string; sacrifice?: boolean; instanceId?: string | null }
  | { kind: "discard"; seat: PlayerKey; instanceId?: string | null; index: number; cardType?: "spell" | "any" }
  | { kind: "spend"; seat: PlayerKey; amount: number }
  | { kind: "flood"; ats: string[]; expiresTurn: string }
  | { kind: "raise"; seat: PlayerKey; to?: string; region?: string; card?: CardRef; fromSeat?: PlayerKey; graveyardIndex?: number }
  | { kind: "damage"; targets: UnitTarget[]; amount: number; random?: boolean; element?: "fire"; splash?: number }
  | { kind: "heal"; seat: PlayerKey; amount: number }
  | { kind: "draw"; seat: PlayerKey; count: number; pile?: "atlas" | "spellbook"; bottom?: boolean }
  | { kind: "gainMana"; seat: PlayerKey; amount: number }
  | { kind: "sleep"; target: UnitTarget }
  | { kind: "swallow"; target: UnitTarget; carrier: UnitTarget }
  | { kind: "immobilizeSites"; ats: string[]; untilTurn: number }
  | { kind: "reorder"; seat: PlayerKey; order: number[]; bottom?: boolean }
  | { kind: "retriggerGenesis"; ats: string[] }
  | { kind: "move"; target: UnitTarget; to: string; preserveRegion?: boolean }
  | { kind: "buff"; target: UnitTarget; power: number; movement: number; blaze?: boolean }
  | { kind: "moveSpent"; target: UnitTarget; steps: number }
  | { kind: "mend"; target: UnitTarget; amount: number }
  | { kind: "subsurface"; targets: UnitTarget[]; state: "burrowed" | "submerged" };

export interface DamageHit {
  target: UnitTarget;
  amount: number;
  element?: "fire";
  lethal?: boolean;
  sourcePower?: number;
  sourceName?: string;
  /** A Ranged strike (Yourke Crossbowmen takes no damage from these). */
  ranged?: boolean;
}

export interface SpellChoice {
  /** Board-first selection: one entry per click needed to reach this choice, in order. An entry is a pick token (pickTokens.js: a tile "x,y", a board card "unit:…", a hand card "hand:…", a direction "dir:…", a pile "pile:…", a draw split "draw:…" or a tile-anchored button "opt:…") or an array of tokens any of which counts. Choices that need no click (e.g. "Gain 7 life") omit it or use []. Caster tiles are NOT included; the UI prepends the caster when choices differ by caster. */
  picks?: (string | string[])[];
  /** Short button text for the opt/dir/pile/draw tokens used in this choice's picks or its decision options (e.g. {"opt:2,3:decline":"Skip"}). */
  pickLabels?: Record<string, string>;
  /** The card a choice is about when it is picked from a card row instead of the board (a random outcome, a Lucky Charm result). */
  card?: { name: string; slug?: string | null; cardId?: number; instanceId?: string | null; type?: string | null };
  /** Short text shown on `card` (e.g. "3 damage"). */
  badge?: string;
  key: string;
  label: string;
  caster: NonNullable<PendingMagic["caster"]>;
  target: MagicTarget | null;
  operations: SpellOperation[];
  /** Live resolution when operations describe only a tactical preview. */
  resolutionOperations?: SpellOperation[];
  score: number;
  /**
   * The default plan of a choice with projectile decisions is the only sensible one
   * (e.g. a unique shortest Blaze route), so the controller may resolve it without a prompt.
   */
  autoResolve?: boolean;
  projectile?: {
    baseKey: string;
    selections: string[];
    /** `at` is the pick token a click selects this option with: a unit token for a unit, a tile for a location, an "opt:<x,y>:stop" button for stopping; unique within a decision. */
    decisions: { label: string; options: { key: string; label: string; at?: string }[] }[];
  };
}

export interface ProjectileOperation {
  kind: "projectileStep";
  name: "Fireball" | "Firebolts" | "Heat Ray" | "Ice Lance" | "Colicky Dragonettes";
  seat: PlayerKey;
  origin: string;
  region: string;
  direction: "N" | "E" | "S" | "W";
  step: number;
  shot: number;
  preferred?: string[];
}

export interface CpuEffectCompletion {
  pending: PendingMagic;
  label: string;
  ability?: boolean;
}

export interface CpuEffectContinuation {
  choice: SpellChoice;
  waitingFor: number;
  completion?: CpuEffectCompletion;
}

export interface LocatedUnit {
  target: UnitTarget;
  at: string;
  region: string;
  owner: PlayerKey;
  card: CardRef;
  damage: number;
}

export type SpellState = Pick<GameState,
  "board" | "permanents" | "avatars" | "players" | "permanentPositions" | "zones" | "turn" | "currentPlayer"
> & { pendingMagic?: GameState["pendingMagic"]; pendingCombat?: GameState["pendingCombat"] };
