import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import type { SpellState } from "@/lib/game/cpu/spellTypes";
import { useGameStore } from "@/lib/game/store";
import type { GameState, PlayerKey } from "@/lib/game/store/types";

export type AbilityChoice = ReturnType<typeof abilityChoices>[number];
export type AbilitySource = AbilityChoice["source"];
/** Every GameState field abilityChoices reads, directly or through the shared spells.js helpers. */
export type AbilityRulesState = SpellState & Pick<GameState, "phase" | "cpuPendingTriggerCount" | "cpuEffectContinuations">;

const NO_ABILITIES: AbilityChoice[] = [];

/** The site, avatar or permanent offering an ability. */
export const abilitySourceId = (choice: AbilityChoice) => `${choice.source.card.instanceId || choice.source.card.name}@${choice.source.at}`;

/** Rules inputs only while an ability can be activated: this mirrors abilityChoices' gate, which yields no choices in every other state. */
export function selectAbilityRules(state: GameState): AbilityRulesState | null {
  const seat = state.actorKey;
  if (!seat || state.matchEnded || state.cpuTriggerOptions?.length || state.phase !== "Main" || state.currentPlayer !== (seat === "p1" ? 1 : 2) ||
    state.pendingMagic || state.pendingCombat || state.cpuPendingTriggerCount || state.cpuEffectContinuations?.length) return null;
  return {phase:state.phase,currentPlayer:state.currentPlayer,turn:state.turn,pendingMagic:state.pendingMagic,pendingCombat:state.pendingCombat,
    cpuPendingTriggerCount:state.cpuPendingTriggerCount,cpuEffectContinuations:state.cpuEffectContinuations,board:state.board,permanents:state.permanents,
    permanentPositions:state.permanentPositions,avatars:state.avatars,players:state.players,zones:state.zones};
}

// Single-entry memo: the ability buttons and the targeting bar select equal rules inputs as separate objects,
// so the second consumer reuses the first one's choices instead of generating them again.
let last: {rules: AbilityRulesState; seat: PlayerKey; choices: AbilityChoice[]} | null = null;
const sameRules = (a: AbilityRulesState, b: AbilityRulesState) => {
  const keys = Object.keys(a) as (keyof AbilityRulesState)[];
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
};
function readyChoices(rules: AbilityRulesState, seat: PlayerKey): AbilityChoice[] {
  if (last && last.seat === seat && sameRules(last.rules,rules)) return last.choices;
  const choices = abilityChoices(rules,seat);
  last = {rules,seat,choices};
  return choices;
}

const selectAbilityKey = (state: GameState) => ({actorKey:state.actorKey,matchId:state.matchId,turn:state.turn,currentPlayer:state.currentPlayer});

/** The activated abilities the local seat can use right now, grouped by source. `request` scopes UI picks to one match, turn and player. */
export function useReadyAbilities() {
  const {actorKey,matchId,turn,currentPlayer} = useGameStore(useShallow(selectAbilityKey));
  const rules = useGameStore(useShallow(selectAbilityRules));
  const choices = useMemo(() => rules && actorKey ? readyChoices(rules,actorKey) : NO_ABILITIES,[rules,actorKey]);
  const sources = useMemo(() => [...new Map(choices.map(choice => [abilitySourceId(choice),choice.source])).entries()],[choices]);
  const size = rules?.board.size;
  return {actorKey,matchId,request:`${matchId}:ability:${turn}:${currentPlayer}`,rules,choices,sources,size};
}

/** Transient UI state shared by the ability buttons and the targeting bar; never sent to the match.
 * `picked` opens targeting for one source, `hovered` lights that source's tile. Both only count for their `request`. */
export const useCpuAbilityPicker = create<{
  request: string; picked: string | null; hovered: string | null;
  pick: (request: string, id: string | null) => void;
  hover: (request: string, id: string | null) => void;
  clear: () => void;
}>((set) => ({
  request:"",picked:null,hovered:null,
  pick:(request,picked) => set(state => state.request === request ? {picked} : {request,picked,hovered:null}),
  hover:(request,hovered) => set(state => state.request === request ? {hovered} : {request,picked:null,hovered}),
  clear:() => set({request:"",picked:null,hovered:null}),
}));
