import { getAttackTargets, isDisabled, unitsInRealm } from "@/lib/game/cpu/spells";
import type { GameState } from "@/lib/game/store/types";
import { getCellNumber } from "@/lib/game/store/utils/boardHelpers";

export function stationaryAttack(state: GameState): GameState["attackTargetChoice"] {
  const seat = state.actorKey;
  if (!seat || state.phase !== "Main" || state.currentPlayer !== (seat === "p1" ? 1 : 2) || state.matchEnded ||
      state.pendingCombat || state.pendingMagic || state.attackChoice || state.attackTargetChoice || state.attackConfirm || state.cpuPendingTriggerCount || state.cpuEffectContinuations?.length) return null;
  const source = unitsInRealm(state).find(unit => unit.owner === seat && (unit.target.kind === "avatar"
    ? state.selectedAvatar === seat
    : !state.selectedAvatar && unit.at === state.selectedPermanent?.at && unit.target.index === state.selectedPermanent.index));
  if (!source || isDisabled(state,source)) return null;
  const entity = source.target.kind === "avatar" ? state.avatars[seat] : state.permanents[source.at][source.target.index];
  if (entity.tapped || entity.summonedThisTurn) return null;
  const choices = getAttackTargets(state,source);
  if (!choices.length) return null;
  const [x,y] = source.at.split(",").map(Number);
  const tile = getCellNumber(x,y,state.board.size.w);
  return {tile:{x,y},attacker:{at:source.at,index:source.target.kind === "avatar" ? -1 : source.target.index,
    owner:seat === "p1" ? 1 : 2,...(source.target.kind === "avatar" ? {isAvatar:true,avatarSeat:seat} : {instanceId:source.target.instanceId})},
    candidates:choices.flatMap(({target}) => {
      const kind = target.kind;
      if (kind !== "site" && kind !== "avatar" && kind !== "permanent") return [];
      return [{...target,kind,label:`${kind === "site" ? state.board.sites[target.at]?.card?.name || "Site" : kind === "avatar" ? "Enemy Avatar" : state.permanents[target.at][target.index ?? 0]?.card?.name || "Minion"} — Tile #${tile}`}];
    })};
}
