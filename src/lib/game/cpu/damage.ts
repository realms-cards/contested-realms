import type { StateCreator } from "zustand";
import { evaluateDamage } from "@/lib/game/cpu/damageRules";
import type { DamageHit, LocatedUnit, SpellState, UnitTarget } from "@/lib/game/cpu/spellTypes";
import { isDisabled, sameTarget, stealthTokenIndex, unitStats, unitsInRealm } from "@/lib/game/cpu/spells";
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

/**
 * Stealth "is tracked with a stealth token, and it's lost after the minion interacts with the realm": mark the loss
 * (printed Stealth stays lost) and banish the token. An Infiltrate token goes through its own resolver, which also hands
 * control of the minion back.
 */
export function loseStealth(set: StoreSet, get: StoreGet, target: UnitTarget) {
  const unit = locateUnit(get(), target);
  if (unit?.target.kind !== "permanent") return;
  const { at } = unit, id = unit.target.instanceId;
  const items = [...get().permanents[at]], item = items[unit.target.index];
  if (!item.cpuStealthLost) {
    items[unit.target.index] = { ...item, cpuStealthLost: true, version: (item.version || 0)+1 };
    set({ permanents: { ...get().permanents, [at]: items } });
    get().trySendPatch({ permanents: { [at]: items } });
  }
  // Banishing re-indexes the cell, so the host is found again before each token.
  for (let guard = items.length; guard > 0; guard--) {
    const cell = get().permanents[at] || [];
    const host = id ? cell.findIndex(entry => (entry.instanceId || entry.card.instanceId) === id) : unit.target.index;
    const token = host < 0 ? -1 : stealthTokenIndex(get().permanents, at, host);
    if (token < 0) return;
    const tokenId = cell[token].instanceId || cell[token].card.instanceId;
    if (tokenId && get().activeInfiltrations?.some(entry => entry.stealthToken?.instanceId === tokenId)) {
      get().handleInfiltrateStealthRemoved(tokenId);
      return;
    }
    get().movePermanentToZone(at, token, "banished");
  }
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
