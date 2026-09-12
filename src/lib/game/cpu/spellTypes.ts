import type { CardRef, GameState, MagicTarget, PendingMagic, PlayerKey } from "@/lib/game/store/types";

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
  | { kind: "mend"; target: UnitTarget; amount: number }
  | { kind: "subsurface"; targets: UnitTarget[]; state: "burrowed" | "submerged" };

export interface DamageHit {
  target: UnitTarget;
  amount: number;
  element?: "fire";
  lethal?: boolean;
  sourcePower?: number;
  sourceName?: string;
}

export interface SpellChoice {
  /** Board fields that can be clicked to narrow this choice. Internal keys only. */
  boardTiles?: string[];
  key: string;
  label: string;
  caster: NonNullable<PendingMagic["caster"]>;
  target: MagicTarget | null;
  operations: SpellOperation[];
  /** Live resolution when operations describe only a tactical preview. */
  resolutionOperations?: SpellOperation[];
  score: number;
  projectile?: {
    baseKey: string;
    selections: string[];
    decisions: { label: string; options: { key: string; label: string }[] }[];
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
