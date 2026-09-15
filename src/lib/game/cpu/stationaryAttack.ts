import { unitToken } from "@/lib/game/cpu/pickTokens";
import type { LocatedUnit } from "@/lib/game/cpu/spellTypes";
import { cardText, getAttackTargets, getRangedTargets, isDisabled, unitsInRealm } from "@/lib/game/cpu/spells";
import type { GameState, PlayerKey } from "@/lib/game/store/types";
import { getCellNumber } from "@/lib/game/store/utils/boardHelpers";

type Candidate = NonNullable<GameState["attackTargetChoice"]>["candidates"][number];
/** The unit to attack with; omitted, the current selection (toolbar button). */
export type AttackSource = { kind: "avatar"; seat: PlayerKey } | { kind: "permanent"; at: string; index: number };

/** A ready unit of the acting seat, while nothing else is resolving. */
function readyAttacker(state: GameState, from?: AttackSource): LocatedUnit | null {
  const seat = state.actorKey;
  if (!seat || state.phase !== "Main" || state.currentPlayer !== (seat === "p1" ? 1 : 2) || state.matchEnded ||
      state.pendingCombat || state.pendingMagic || state.attackChoice || state.attackTargetChoice || state.attackConfirm || state.cpuPendingTriggerCount || state.cpuEffectContinuations?.length) return null;
  const wanted: AttackSource | null = from ?? (state.selectedAvatar === seat ? {kind:"avatar",seat}
    : !state.selectedAvatar && state.selectedPermanent ? {kind:"permanent",at:state.selectedPermanent.at,index:state.selectedPermanent.index} : null);
  if (!wanted) return null;
  const source = unitsInRealm(state).find(unit => unit.owner === seat && (unit.target.kind === "avatar"
    ? wanted.kind === "avatar" && wanted.seat === seat
    : wanted.kind === "permanent" && unit.at === wanted.at && unit.target.index === wanted.index));
  if (!source || isDisabled(state,source)) return null;
  const entity = source.target.kind === "avatar" ? state.avatars[seat] : state.permanents[source.at][source.target.index];
  // Charge lets a unit act the turn it was summoned.
  return entity.tapped || (entity.summonedThisTurn && !/\bCharge\b/.test(cardText(source.card))) ? null : source;
}

const tileOf = (state: GameState, at: string) => {
  const [x,y] = at.split(",").map(Number);
  return getCellNumber(x,y,state.board.size.w);
};

const nameAt = (state: GameState, kind: Candidate["kind"], at: string, index: number | null) =>
  kind === "site" ? state.board.sites[at]?.card?.name || "Site" : kind === "avatar" ? "Enemy Avatar" : state.permanents[at]?.[index ?? 0]?.card?.name || "Minion";

function choiceFor(source: LocatedUnit, candidates: Candidate[], ranged: boolean): GameState["attackTargetChoice"] {
  if (!candidates.length) return null;
  const [x,y] = source.at.split(","),owner = source.owner === "p1" ? 1 : 2;
  return {tile:{x:Number(x),y:Number(y)},...(ranged ? {ranged} : {}),candidates,attacker:{at:source.at,index:source.target.kind === "avatar" ? -1 : source.target.index,owner,
    ...(source.target.kind === "avatar" ? {isAvatar:true,avatarSeat:source.owner} : {instanceId:source.target.instanceId})}};
}

/** Attack a target at the unit's current tile, without moving. */
export function stationaryAttack(state: GameState, from?: AttackSource): GameState["attackTargetChoice"] {
  const source = readyAttacker(state,from);
  if (!source) return null;
  // An oversized attacker (Mountain Giant) fights at any of its locations; those candidates carry where the fight is.
  return choiceFor(source,(source.cells || [source.at]).flatMap(at => getAttackTargets(state,source,at).flatMap(({target}) => {
    const kind = target.kind;
    if (kind !== "site" && kind !== "avatar" && kind !== "permanent") return [];
    const [x,y] = at.split(",").map(Number);
    return [{...target,kind,...(source.cells ? {tile:{x,y}} : {}),label:`${nameAt(state,kind,target.at,target.index)} — Tile #${tileOf(state,at)}`}];
  })),false);
}

type Choice = NonNullable<GameState["attackTargetChoice"]>;

/** The board pick for a candidate: the unit's card (unit token), or the tile for a site. */
export function attackTargetToken(state: Pick<GameState, "permanents">, choice: Choice, candidate: Candidate): string {
  if (candidate.kind === "site") return candidate.at;
  if (candidate.kind === "avatar") return unitToken({kind:"avatar",seat:choice.attacker.owner === 1 ? "p2" : "p1"});
  const index = candidate.index ?? 0;
  return unitToken({kind:"permanent",at:candidate.at,index,instanceId:state.permanents[candidate.at]?.[index]?.instanceId ?? null});
}

/** The attacking unit's card token, lit as the source while its target is picked. */
export function attackerToken(state: Pick<GameState, "permanents">, choice: Choice): string {
  const {attacker} = choice;
  if (attacker.isAvatar) return unitToken({kind:"avatar",seat:attacker.avatarSeat ?? (attacker.owner === 1 ? "p1" : "p2")});
  return unitToken({kind:"permanent",at:attacker.at,index:attacker.index,instanceId:state.permanents[attacker.at]?.[attacker.index]?.instanceId ?? attacker.instanceId ?? null});
}

/** Ranged X: tap to strike the first unit up to X steps away in a straight line. No movement, no defenders, no strike back. */
export function rangedAttack(state: GameState, from?: AttackSource): GameState["attackTargetChoice"] {
  const source = readyAttacker(state,from);
  return source ? choiceFor(source,getRangedTargets(state,source).map(({target}) =>
    ({...target,label:`${nameAt(state,target.kind,target.at,target.index)} — Tile #${tileOf(state,target.at)}`})),true) : null;
}
