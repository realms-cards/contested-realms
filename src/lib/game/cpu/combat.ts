import type { StateCreator } from "zustand";
import { applyDamageEvent, locateUnit, loseStealth } from "@/lib/game/cpu/damage";
import type { DamageHit, LocatedUnit, UnitTarget } from "@/lib/game/cpu/spellTypes";
import { cardText, isDisabled, sameTarget, shareLocation, unitStats } from "@/lib/game/cpu/spells";
import type { GameState, PlayerKey } from "@/lib/game/store/types";
import type { CustomMessage } from "@/lib/net/transport";

type StoreSet = Parameters<StateCreator<GameState>>[0];
type StoreGet = Parameters<StateCreator<GameState>>[1];

export function resolveCpuCombat(set: StoreSet, get: StoreGet) {
  const state = get(), pending = state.pendingCombat;
  if (!pending || pending.status !== "committed") return;
  const attackerSeat: PlayerKey = pending.attacker.owner === 1 ? "p1" : "p2";
  const defenderSeat: PlayerKey = attackerSeat === "p1" ? "p2" : "p1";
  const attackerTarget: UnitTarget = pending.attacker.isAvatar
    ? { kind: "avatar", seat: pending.attacker.avatarSeat || attackerSeat }
    : { kind: "permanent", ...pending.attacker };
  const attacker = locateUnit(state,attackerTarget);
  if (!attacker) { state.log("Waiting for the attacker's position to synchronize."); return; }
  const defenders: LocatedUnit[] = [];
  for (const selected of pending.defenders) {
    // Only the defending seat's own Avatar can defend (rulebook "Defend"/"Intercept": Avatars are units).
    if (selected.isAvatar && selected.avatarSeat && selected.avatarSeat !== defenderSeat) continue;
    const unit = locateUnit(state,selected.isAvatar ? { kind: "avatar", seat: defenderSeat } : { kind: "permanent", ...selected });
    if (!unit || !shareLocation(unit,attacker) || unit.region !== attacker.region) {
      state.log("Waiting for defenders to reach the combat location."); return;
    }
    if (!defenders.some(other => sameTarget(other.target,unit.target))) defenders.push(unit);
  }
  if (!defenders.length && pending.target?.kind !== "site") {
    const target: UnitTarget | null = pending.target?.kind === "avatar" ? { kind: "avatar", seat: defenderSeat }
      : pending.target?.kind === "permanent" && pending.target.index !== null
        ? { kind: "permanent", at: pending.target.at, index: pending.target.index } : null;
    const unit = target ? locateUnit(state,target) : null;
    if (target && (!unit || !shareLocation(unit,attacker) || unit.region !== attacker.region)) return;
    if (unit) defenders.push(unit);
  }
  const attachments = (unit: LocatedUnit) => unit.target.kind === "permanent"
    ? (state.permanents[unit.at] || []).filter(item => item.attachedTo?.at === unit.at && unit.target.kind === "permanent" && item.attachedTo.index === unit.target.index) : [];
  const lance = (unit: LocatedUnit) => attachments(unit).some(item => item.card.name === "Lance");
  const first = (unit: LocatedUnit) => lance(unit) || /strikes? first/i.test(cardText(unit.card));
  const power = (unit: LocatedUnit) => {
    if (isDisabled(state,unit)) return 0;
    if (attachments(unit).some(item => item.card.name === "Disabled")) return 0;
    if (unit !== attacker && unit.card.name === "Escyllion Cyclops") return 0;
    return Math.max(0,unitStats(state,unit).atk+(lance(unit) ? 1 : 0));
  };
  const attackPower = power(attacker);
  const allocation = new Map<LocatedUnit,number>();
  // Assignment entries address a defending Avatar as { at, index: -1 } (it has no permanents slot).
  const assignedTo = (unit: LocatedUnit, entry: { at: string; index: number }) => unit.at === entry.at &&
    (unit.target.kind === "avatar" ? entry.index === -1 : unit.target.index === entry.index);
  if (defenders.length === 1) allocation.set(defenders[0],attackPower);
  else if (defenders.length > 1) {
    const assigned = pending.assignment || [];
    const valid = assigned.every(entry => Number.isInteger(entry.amount) && entry.amount >= 0 &&
      defenders.some(unit => assignedTo(unit,entry))) &&
      assigned.reduce((sum,entry) => sum+entry.amount,0) === attackPower;
    if (state.actorKey === attackerSeat && !valid) {
      state.log(`Allocate ${attackPower} damage among the defenders before resolving.`); return;
    }
    if (valid && state.actorKey === attackerSeat) {
      for (const unit of defenders) allocation.set(unit,assigned.filter(entry => assignedTo(unit,entry)).reduce((sum,entry) => sum+entry.amount,0));
    } else {
      // The CPU owns its attack allocation, even though the human client is
      // adjudicating the fight. Prefer affordable kills over spreading damage.
      let remaining = attackPower;
      const ordered = [...defenders].sort((a,b) => (unitStats(state,a).def-a.damage)-(unitStats(state,b).def-b.damage));
      for (const unit of ordered) {
        const lethal = /\bLethal\b/.test(cardText(attacker.card));
        const amount = Math.min(remaining,lethal ? 1 : Math.max(1,unitStats(state,unit).def-unit.damage));
        allocation.set(unit,amount); remaining -= amount;
      }
      if (remaining) allocation.set(ordered[0],(allocation.get(ordered[0]) || 0)+remaining);
    }
  }

  // Claim the interaction before mutations; echoes cannot deal damage twice.
  set({ pendingCombat: null, attackChoice: null, attackTargetChoice: null, attackConfirm: null });
  const struck = new Set<LocatedUnit>();
  if (!defenders.length) {
    // An undefended intercept offer is NOT an attack on the underlying site.
    if (pending.target?.kind === "site" && attackPower > 0) {
      const owner = state.board.sites[pending.target.at]?.owner;
      if (owner && owner !== pending.attacker.owner) get().addLife(owner === 1 ? "p1" : "p2",-attackPower,false);
      struck.add(attacker);
    }
  } else {
    for (const firstStrikeRound of [true,false]) {
      const hits: DamageHit[] = [];
      const alive = (unit: LocatedUnit) => !!locateUnit(get(),unit.target) &&
        (unit.target.kind !== "avatar" || get().players[unit.target.seat].lifeState !== "dead");
      if (first(attacker) === firstStrikeRound && alive(attacker)) {
        for (const defender of defenders.filter(alive)) {
          hits.push({ target: defender.target, amount: allocation.get(defender) || 0,
            lethal: /\bLethal\b/.test(cardText(attacker.card)), sourcePower: unitStats(state,attacker).atk });
        }
        struck.add(attacker);
      }
      for (const defender of defenders) {
        if (first(defender) !== firstStrikeRound || !alive(defender) || !alive(attacker)) continue;
        hits.push({ target: attacker.target, amount: power(defender),
          lethal: /\bLethal\b/.test(cardText(defender.card)), sourcePower: unitStats(state,defender).atk });
        if (power(defender) > 0) struck.add(defender);
      }
      applyDamageEvent(set,get,hits);
    }
  }
  for (const unit of struck) {
    const survivor = locateUnit(get(),unit.target);
    if (survivor?.target.kind === "permanent") loseStealth(set,get,survivor.target);
    for (const token of attachments(unit).filter(item => item.card.name === "Lance")) {
      for (const [at,items] of Object.entries(get().permanents)) {
        const index = items.findIndex(item => item.instanceId === token.instanceId);
        if (index >= 0) get().movePermanentToZone(at,index,"banished");
      }
    }
  }
  const summary = { id: pending.id, text: `${attacker.card.name}: ${defenders.length ? `fight with ${defenders.map(unit => unit.card.name).join(", ")}` : pending.target?.kind === "site" ? `${attackPower} life lost at site` : "no combat"} resolved.`,
    actor: attackerSeat, targetSeat: defenderSeat, ts: Date.now() };
  get().setLastCombatSummary(summary);
  get().log(summary.text);
  // No separate damage/kill messages: both seats' changes are in normal patches.
  get().transport?.sendMessage?.({ type: "combatResolve", id: pending.id, tile: pending.tile, attacker: pending.attacker, defenders: pending.defenders } as unknown as CustomMessage);
  get().transport?.sendMessage?.({ type: "combatSummary", ...summary } as unknown as CustomMessage);
  get().checkMatchEnd();
}
