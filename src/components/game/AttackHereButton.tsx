"use client";

import { Icon } from "@iconify/react";
import { rangedAttack, stationaryAttack } from "@/lib/game/cpu/stationaryAttack";
import { useGameStore } from "@/lib/game/store";

const BTN = "flex items-center gap-1.5 px-3 py-2 font-rc-sans text-sm text-rc-danger-ink transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/** Attacks without moving, for the selected unit: melee at its tile, or a Ranged strike. */
export default function AttackHereButton() {
  const guides = useGameStore((s) => s.combatGuidesActive && !!s.actorKey);
  const melee = useGameStore((s) => !!stationaryAttack(s));
  const ranged = useGameStore((s) => !!rangedAttack(s));
  if (!guides) return null;
  const start = (choose: typeof stationaryAttack) => {
    const state = useGameStore.getState(), choice = choose(state);
    if (choice) state.setAttackTargetChoice(choice);
  };
  return <div role="group" aria-label="Attack without moving" className="flex overflow-hidden rounded-rc-md bg-[rgba(7,10,20,0.85)] shadow-rc-panel ring-1 ring-rc-danger/40">
    <button type="button" disabled={!melee} onClick={() => start(stationaryAttack)} className={`${BTN} bg-rc-danger/30 hover:bg-rc-danger/45`}
      title={melee ? "Choose a target at this unit's current tile, without moving" : "Select one of your ready units with a legal target here"}>
      <Icon icon="game-icons:crossed-swords" width={16} height={16} />Attack here
    </button>
    <button type="button" disabled={!ranged} onClick={() => start(rangedAttack)} className={`${BTN} border-l border-rc-danger/40 bg-rc-danger/15 hover:bg-rc-danger/30`}
      title={ranged ? "Tap to shoot the first unit in a straight line; it can't strike back" : "Select one of your ready Ranged units with a target in range"}>
      <Icon icon="game-icons:high-shot" width={16} height={16} />Ranged
    </button>
  </div>;
}
