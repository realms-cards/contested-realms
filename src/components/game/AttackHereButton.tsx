"use client";

import { stationaryAttack } from "@/lib/game/cpu/stationaryAttack";
import { useGameStore } from "@/lib/game/store";

export default function AttackHereButton() {
  const state = useGameStore();
  const choice = stationaryAttack(state);
  return <button disabled={!choice} title={choice ? "Choose a target at this unit's current tile, without moving" : "Select one of your ready units with a legal target here"}
    className="rounded-lg bg-red-800 px-3 py-2 text-sm text-white disabled:opacity-40"
    onClick={() => {
      const current = useGameStore.getState(), attack = stationaryAttack(current);
      if (attack) current.setAttackTargetChoice(attack);
    }}>Attack here</button>;
}
