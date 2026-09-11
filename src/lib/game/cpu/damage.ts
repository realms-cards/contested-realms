import type { StateCreator } from "zustand";
import { evaluateDamage } from "@/lib/game/cpu/damageRules";
import type { DamageHit, LocatedUnit, SpellState, UnitTarget } from "@/lib/game/cpu/spellTypes";
import { isDisabled, sameTarget, unitStats, unitsInRealm } from "@/lib/game/cpu/spells";
import type { GameState, PermanentItem } from "@/lib/game/store/types";

type StoreSet = Parameters<StateCreator<GameState>>[0];
type StoreGet = Parameters<StateCreator<GameState>>[1];

/** Evaluate a simultaneous damage event before removing any casualties. */
export function damageOutcome(state: SpellState, unit: LocatedUnit, hits: DamageHit[]) {
  const item = unit.target.kind === "permanent" ? state.permanents[unit.at]?.[unit.target.index] : null;
  const turn = `${state.turn}:${state.currentPlayer}`;
  const incoming = hits.filter(hit => hit.amount > 0 && sameTarget(unit.target, hit.target));
  return evaluateDamage({ name: isDisabled(state,unit) ? "" : unit.card.name, damage: unit.damage, defence: unitStats(state,unit).def,
    damagePreventedTurn: item?.cpuDamagePreventedTurn, avatar: unit.target.kind === "avatar" }, incoming, turn);
}

export function locateUnit(state: SpellState, target: UnitTarget) {
  return unitsInRealm(state).find(unit => sameTarget(unit.target, target));
}

export function applyDamageEvent(set: StoreSet, get: StoreGet, hits: DamageHit[]) {
  const before = get();
  const outcomes = unitsInRealm(before).filter(unit => hits.some(hit => sameTarget(unit.target,hit.target)))
    .map(unit => ({ unit, result: damageOutcome(before,unit,hits) }));
  const permanents = { ...before.permanents };
  const changed = new Set<string>();
  for (const {unit,result} of outcomes) {
    if (unit.target.kind === "avatar") {
      if (result.damage > 0) get().addLife(unit.target.seat,-result.damage,true);
      continue;
    }
    const index = unit.target.index;
    const item = permanents[unit.at][index];
    const turn = `${before.turn}:${before.currentPlayer}`;
    const previous = item.cpuTurnEffect?.turn === turn ? item.cpuTurnEffect : null;
    const next: PermanentItem = { ...item, damage: result.remainingDamage, version: (item.version || 0)+1 };
    if (result.damage>0) next.cpuAsleep = false;
    if (result.power) next.cpuTurnEffect = { ...previous,turn, power: (previous?.power || 0)+result.power, movement: previous?.movement || 0 };
    if (result.prevented) next.cpuDamagePreventedTurn = turn;
    permanents[unit.at] = [...permanents[unit.at]];
    permanents[unit.at][index] = next;
    changed.add(unit.at);
  }
  if (changed.size) {
    set({ permanents });
    get().trySendPatch({ permanents: Object.fromEntries([...changed].map(at => [at,permanents[at]])) });
  }
  for (const {unit,result} of outcomes) {
    if (!result.killed) continue;
    const found = locateUnit(get(),unit.target);
    if (found?.target.kind === "permanent") get().movePermanentToZone(found.at,found.target.index,"graveyard");
  }
  get().checkMatchEnd();
}
