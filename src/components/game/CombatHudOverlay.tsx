"use client";

import React, { useEffect, useState } from "react";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore, type CellKey } from "@/lib/game/store";
import {
  getCellNumber,
  seatFromOwner,
} from "@/lib/game/store/utils/boardHelpers";

export default function CombatHudOverlay() {
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const board = useGameStore((s) => s.board);
  const permanents = useGameStore((s) => s.permanents);
  const metaByCardId = useGameStore((s) => s.metaByCardId);
  const players = useGameStore((s) => s.players);

  const attackChoice = useGameStore((s) => s.attackChoice);
  const setAttackChoice = useGameStore((s) => s.setAttackChoice);
  const attackTargetChoice = useGameStore((s) => s.attackTargetChoice);
  const setAttackTargetChoice = useGameStore((s) => s.setAttackTargetChoice);
  const attackConfirm = useGameStore((s) => s.attackConfirm);
  const setAttackConfirm = useGameStore((s) => s.setAttackConfirm);
  const pendingCombat = useGameStore((s) => s.pendingCombat);
  const lastCombatSummary = useGameStore((s) => s.lastCombatSummary);
  const setLastCombatSummary = useGameStore((s) => s.setLastCombatSummary);

  const declareAttack = useGameStore((s) => s.declareAttack);
  const requestRevertCrossMove = useGameStore((s) => s.requestRevertCrossMove);
  const commitDefenders = useGameStore((s) => s.commitDefenders);
  const autoResolveCombat = useGameStore((s) => s.autoResolveCombat);
  const cancelCombat = useGameStore((s) => s.cancelCombat);
  const offerIntercept = useGameStore((s) => s.offerIntercept);

  const combatGuidesActive = useGameStore((s) => s.combatGuidesActive);

  const actorIsActive =
    (actorKey === "p1" && currentPlayer === 1) ||
    (actorKey === "p2" && currentPlayer === 2);

  const tileNum = (() => {
    const source =
      attackChoice?.tile ??
      attackTargetChoice?.tile ??
      attackConfirm?.tile ??
      null;
    return source ? getCellNumber(source.x, source.y, board.size.w) : null;
  })();

  const attackerLabel = (() => {
    const pc = pendingCombat?.attacker;
    if (pc) {
      try {
        return permanents[pc.at]?.[pc.index]?.card?.name || "Attacker";
      } catch {}
    }
    return null;
  })();

  function AttackerAssignmentBar() {
    const actorKey = useGameStore((s) => s.actorKey);
    const pendingCombat = useGameStore((s) => s.pendingCombat);
    const setDamageAssignment = useGameStore((s) => s.setDamageAssignment);
    const permanents = useGameStore((s) => s.permanents);
    const metaByCardId = useGameStore((s) => s.metaByCardId);
    const [assign, setAssign] = useState<Record<string, number>>({});

    const pc = pendingCombat;
    const defs = pc?.defenders ? pc.defenders : [];
    const aSeat: "p1" | "p2" = (() => {
      const owner = pc?.attacker?.owner;
      return owner === 1 || owner === 2 ? seatFromOwner(owner) : "p1";
    })();
    const amAttacker = actorKey ? actorKey === aSeat : true;

    function getAtkDef(
      at: string,
      index: number
    ): { atk: number; def: number } {
      try {
        const cardId = permanents[at]?.[index]?.card?.cardId;
        const m = cardId ? metaByCardId[Number(cardId)] : undefined;
        return {
          atk: Number(m?.attack ?? 0) || 0,
          def: Number(m?.defence ?? m?.attack ?? 0) || 0,
        };
      } catch {
        return { atk: 0, def: 0 };
      }
    }
    function getAttachments(at: string, index: number) {
      const list = permanents[at] || [];
      return list.filter(
        (p) =>
          p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index
      );
    }
    function computeEffectiveAttack(a: { at: CellKey; index: number }): {
      atk: number;
      firstStrike: boolean;
    } {
      const base = getAtkDef(a.at, a.index).atk;
      const attachments = getAttachments(a.at, a.index);
      let atk = base;
      let firstStrike = false;
      let disabled = false;
      for (const t of attachments) {
        const nm = (t.card?.name || "").toLowerCase();
        if (nm === "lance") {
          firstStrike = true;
          atk += 1;
        }
        if (nm === "disabled") {
          disabled = true;
        }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }

    const totalAtk = (() => {
      if (!pc) return 0;
      const eff = computeEffectiveAttack({
        at: pc.attacker.at,
        index: pc.attacker.index,
      });
      return Math.max(0, Math.floor(eff.atk));
    })();
    const asList = defs.map((d) => ({
      key: `${d.at}:${d.index}`,
      at: d.at as CellKey,
      index: d.index,
    }));
    useEffect(() => {
      setAssign({});
    }, [pc?.id]);
    const sum = Object.values(assign).reduce(
      (a, v) => a + (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0),
      0
    );
    const valid = defs.length <= 1 || sum === totalAtk;
    const quickFill = () => {
      let left = totalAtk;
      const next: Record<string, number> = {};
      for (const d of asList) {
        const take = Math.max(0, Math.min(left, totalAtk));
        next[d.key] = take;
        left -= take;
        if (left <= 0) break;
      }
      setAssign(next);
    };
    const reset = () => setAssign({});
    const pushAssignment = () => {
      const payload = asList.map((d) => ({
        at: d.at,
        index: d.index,
        amount: Math.max(0, Math.floor(assign[d.key] || 0)),
      }));
      setDamageAssignment(payload);
    };

    if (!pc) return null;
    if (!amAttacker) return null;
    const committed = pc.status === "committed";

    return (
      <div className="fixed inset-x-0 bottom-24 z-40 pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-base md:text-lg flex items-center gap-3">
          {!committed ? (
            <span className="text-xs opacity-75 mr-1">
              Waiting for defense commit…
            </span>
          ) : null}
          {defs.length > 1 ? (
            <>
              <div className="text-sm opacity-80">
                Assign {totalAtk} damage:
              </div>
              {asList.map((d, i) => (
                <div key={d.key} className="flex items-center gap-1">
                  <span className="text-xs opacity-80">D{i + 1}</span>
                  <input
                    type="number"
                    min={0}
                    className="w-16 bg-white/10 rounded px-2 py-1 text-sm"
                    value={
                      Number.isFinite(assign[d.key])
                        ? (assign[d.key] as number)
                        : ""
                    }
                    onChange={(e) => {
                      const v = Math.max(
                        0,
                        Math.floor(Number(e.target.value || 0))
                      );
                      setAssign((prev) => ({ ...prev, [d.key]: v }));
                    }}
                    disabled={!committed}
                  />
                </div>
              ))}
              <div className="text-xs opacity-80">
                Sum {sum}/{totalAtk}
              </div>
              <button
                className="rounded bg-white/15 hover:bg-white/25 px-2 py-1 text-xs disabled:opacity-50"
                onClick={quickFill}
                disabled={!committed}
              >
                Quick Fill
              </button>
              <button
                className="rounded bg-white/15 hover:bg-white/25 px-2 py-1 text-xs disabled:opacity-50"
                onClick={reset}
                disabled={!committed}
              >
                Reset
              </button>
              <button
                className="rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1 text-sm disabled:opacity-50"
                onClick={pushAssignment}
                disabled={!committed || !valid}
              >
                Set
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function defenderNames(limit = 3): string {
    const list = pendingCombat?.defenders || [];
    const names = list
      .map((d) => {
        try {
          return permanents[d.at]?.[d.index]?.card?.name || null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];
    const head = names.slice(0, limit).join(", ");
    return head + (names.length > limit ? ", …" : "");
  }

  // Utility: compute effective attack incl. attachments (Lance +1 and First Strike, Disabled => 0)
  function getAtkDef(at: string, index: number): { atk: number; def: number } {
    try {
      const cardId = permanents[at]?.[index]?.card?.cardId;
      const m = cardId ? metaByCardId[Number(cardId)] : undefined;
      return {
        atk: Number(m?.attack ?? 0) || 0,
        def: Number(m?.defence ?? m?.attack ?? 0) || 0,
      };
    } catch {
      return { atk: 0, def: 0 };
    }
  }
  function getAttachments(at: string, index: number) {
    const list = permanents[at] || [];
    return list.filter(
      (p) =>
        p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index
    );
  }
  function computeEffectiveAttack(a: { at: CellKey; index: number }): {
    atk: number;
    firstStrike: boolean;
  } {
    const base = getAtkDef(a.at, a.index).atk;
    const attachments = getAttachments(a.at, a.index);
    let atk = base;
    let firstStrike = false;
    let disabled = false;
    for (const t of attachments) {
      const nm = (t.card?.name || "").toLowerCase();
      if (nm === "lance") {
        firstStrike = true;
        atk += 1;
      }
      if (nm === "disabled") {
        disabled = true;
      }
    }
    if (disabled) atk = 0;
    if (!Number.isFinite(atk)) atk = 0;
    return { atk, firstStrike };
  }

  const targetLabel = (() => {
    const t = pendingCombat?.target;
    if (!t) return null;
    if (t.kind === "site") {
      const siteName = board.sites[`${t.at}`]?.card?.name || "Site";
      const owner =
        (board.sites[`${t.at}`]?.owner as 1 | 2 | undefined) ?? undefined;
      const seat = owner === 1 ? "P1" : owner === 2 ? "P2" : null;
      return seat ? `${siteName} (${seat})` : siteName;
    }
    if (t.kind === "avatar") {
      const seat = (pendingCombat?.defenderSeat ??
        (pendingCombat?.attacker.owner === 1 ? "p2" : "p1")) as "p1" | "p2";
      return `Avatar (${seat?.toUpperCase?.() ?? "?"})`;
    }
    try {
      return permanents[t.at]?.[t.index ?? -1]?.card?.name || "Unit";
    } catch {
      return "Unit";
    }
  })();

  function SuggestionConfirm() {
    if (!attackConfirm) return null;
    const eff = computeEffectiveAttack({
      at: attackConfirm.attacker.at,
      index: attackConfirm.attacker.index,
    });
    // Site damage suggestion follows DD rule
    if (attackConfirm.target.kind === "site") {
      const owner = (() => {
        try {
          return (
            (board.sites[attackConfirm.target.at]?.owner as
              | 1
              | 2
              | undefined) ?? null
          );
        } catch {
          return null;
        }
      })();
      if (owner === 1 || owner === 2) {
        const seat: "p1" | "p2" =
          owner === 1 || owner === 2 ? seatFromOwner(owner) : "p1";
        const dd = players[seat].lifeState === "dd";
        const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
        return (
          <span className="opacity-80">
            - Deal <span className="font-semibold">{dmg}</span> to{" "}
            <span
              className="font-semibold"
              style={{ color: PLAYER_COLORS[seat] }}
            >
              {seat.toUpperCase()}
            </span>
            {eff.firstStrike ? " (FS)" : ""}
          </span>
        );
      }
    }
    // Avatar damage suggestion with DD rules
    if (attackConfirm.target.kind === "avatar") {
      const seat: "p1" | "p2" =
        attackConfirm.attacker.owner === 1 ? "p2" : "p1";
      const life = Number(players[seat]?.life ?? 0);
      const isDD = players[seat]?.lifeState === "dd";
      if (isDD) {
        return (
          <span className="opacity-80">
            -{" "}
            <span
              className="font-semibold"
              style={{ color: PLAYER_COLORS[seat] }}
            >
              {seat.toUpperCase()}
            </span>{" "}
            reduced to <span className="font-semibold">0</span> (lethal from DD)
          </span>
        );
      }
      const dmg = Math.max(0, Math.floor(eff.atk));
      const next = Math.max(0, life - dmg);
      if (life > 0 && next <= 0) {
        return (
          <span className="opacity-80">
            - {seat.toUpperCase()} reaches Death&apos;s Door
          </span>
        );
      }
      return (
        <span className="opacity-80">
          - Deal <span className="font-semibold">{dmg}</span> to{" "}
          <span
            className="font-semibold"
            style={{ color: PLAYER_COLORS[seat] }}
          >
            {seat.toUpperCase()}
          </span>
          {eff.firstStrike ? " (FS)" : ""}
        </span>
      );
    }
    // Unit/Avatar suggestion uses atk vs def
    let tDef = 0;
    if (
      attackConfirm.target.kind === "permanent" &&
      attackConfirm.target.index != null
    ) {
      tDef = getAtkDef(attackConfirm.target.at, attackConfirm.target.index).def;
    } else if (pendingCombat?.defenders?.length) {
      tDef = pendingCombat.defenders.reduce(
        (s, d) => s + getAtkDef(d.at, d.index).def,
        0
      );
    } else if (
      pendingCombat?.target &&
      pendingCombat.target.kind === "permanent" &&
      pendingCombat.target.index != null
    ) {
      tDef = getAtkDef(pendingCombat.target.at, pendingCombat.target.index).def;
    }
    const verdict = eff.atk >= tDef ? "likely kill" : "may fail";
    return (
      <span className="opacity-80">
        - Atk {eff.atk}
        {eff.firstStrike ? " (FS)" : ""} vs Def {tDef} ({verdict})
      </span>
    );
  }

  function SuggestionDefense() {
    if (!pendingCombat) return null;
    const a = computeEffectiveAttack({
      at: pendingCombat.attacker.at,
      index: pendingCombat.attacker.index,
    });
    let sumDef = 0;
    let sumAtk = 0;
    let haveAny = false;
    for (const d of pendingCombat.defenders || []) {
      haveAny = true;
      const m = getAtkDef(d.at, d.index);
      sumDef += Number(m.def);
      sumAtk += Number(m.atk);
    }
    // If no defenders selected yet but target is a unit, include it as provisional target
    let targetName: string | null = null;
    if (
      !haveAny &&
      pendingCombat.target &&
      pendingCombat.target.kind === "permanent" &&
      pendingCombat.target.index != null
    ) {
      const t = getAtkDef(pendingCombat.target.at, pendingCombat.target.index);
      sumDef = Number(t.def);
      sumAtk = Number(t.atk);
      try {
        targetName =
          permanents[pendingCombat.target.at]?.[pendingCombat.target.index]
            ?.card?.name || null;
      } catch {
        targetName = null;
      }
      haveAny = true;
    }
    // If no defenders and target is site/avatar, show expected damage (including DD rules)
    if (!haveAny && pendingCombat.target) {
      if (pendingCombat.target.kind === "site") {
        const owner = (() => {
          try {
            return (
              (board.sites[pendingCombat.target.at]?.owner as
                | 1
                | 2
                | undefined) ?? null
            );
          } catch {
            return null;
          }
        })();
        const fallbackSeat = (pendingCombat.defenderSeat ??
          (pendingCombat.attacker.owner === 1 ? "p2" : "p1")) as "p1" | "p2";
        const seat: "p1" | "p2" =
          owner === 1 ? "p1" : owner === 2 ? "p2" : fallbackSeat;
        if (seat === "p1" || seat === "p2") {
          const dd = players[seat].lifeState === "dd";
          const dmg = dd ? 0 : Math.max(0, Math.floor(a.atk));
          return (
            <span className="opacity-70 ml-2">
              · Expected: deal <span className="font-semibold">{dmg}</span> to
              <span
                className="font-semibold"
                style={{ color: PLAYER_COLORS[seat] }}
              >
                {" "}
                {seat.toUpperCase()}
              </span>
              {a.firstStrike ? " (FS)" : ""}
            </span>
          );
        }
      } else if (pendingCombat.target.kind === "avatar") {
        const seat: "p1" | "p2" =
          pendingCombat.attacker.owner === 1 ? "p2" : "p1";
        const life = Number(players[seat]?.life ?? 0);
        const isDD = players[seat]?.lifeState === "dd";
        if (isDD) {
          return (
            <span className="opacity-70 ml-2">
              · Expected:{" "}
              <span
                className="font-semibold"
                style={{ color: PLAYER_COLORS[seat] }}
              >
                {seat.toUpperCase()}
              </span>{" "}
              reduced to <span className="font-semibold">0</span> (lethal from
              DD)
            </span>
          );
        }
        const dmg = Math.max(0, Math.floor(a.atk));
        const next = Math.max(0, life - dmg);
        if (life > 0 && next <= 0) {
          return (
            <span className="opacity-70 ml-2">
              · Expected: {seat.toUpperCase()} reaches Death&apos;s Door;
              further avatar/site damage this turn won&apos;t reduce life
            </span>
          );
        }
        return (
          <span className="opacity-70 ml-2">
            · Deal <span className="font-semibold">{dmg}</span> to
            <span
              className="font-semibold"
              style={{ color: PLAYER_COLORS[seat] }}
            >
              {" "}
              {seat.toUpperCase()}
            </span>
            , life {life} → {next}
            {a.firstStrike ? " (FS)" : ""}
          </span>
        );
      }
    }
    const attackerDef = (() => {
      try {
        const id =
          permanents[pendingCombat.attacker.at]?.[pendingCombat.attacker.index]
            ?.card?.cardId;
        const m = id ? metaByCardId[Number(id)] : undefined;
        return m?.defence ?? null;
      } catch {
        return null;
      }
    })();
    // If exactly one defender, show compact outcome form
    const defs = pendingCombat.defenders || [];
    if (haveAny && defs.length === 1) {
      const d0 = defs[0];
      const defName = (() => {
        try {
          return permanents[d0.at]?.[d0.index]?.card?.name || "Defender";
        } catch {
          return "Defender";
        }
      })();
      const defenderPower = (() => {
        try {
          const id = permanents[d0.at]?.[d0.index]?.card?.cardId;
          const m = id ? metaByCardId[Number(id)] : undefined;
          return Number(m?.attack ?? 0) || 0;
        } catch {
          return 0;
        }
      })();
      const defenderDef = sumDef; // single defender => its defence
      const attackerPower = a.atk;
      const attKillsDef = attackerPower >= defenderDef;
      const defKillsAtt =
        attackerDef != null ? defenderPower >= attackerDef : false;
      const outcome = (() => {
        if (attKillsDef && defKillsAtt) return "both die";
        if (!attKillsDef && defKillsAtt)
          return "Attacker dies, Defender survives";
        if (attKillsDef && !defKillsAtt)
          return "Attacker survives, Defender dies";
        return "both survive";
      })();
      return (
        <span className="opacity-70 ml-2">
          <span className="font-medium">{defName}</span> defends! Attacker{" "}
          <span className="font-semibold">{attackerPower}</span> Defender{" "}
          <span className="font-semibold">{defenderPower}</span> → {outcome}
        </span>
      );
    }
    // Default multi-defender suggestion text
    const parts: string[] = [];
    parts.push(`Atk ${a.atk}${a.firstStrike ? " (FS)" : ""}`);
    if (haveAny)
      parts.push(`vs ${targetName ? `${targetName} ` : ""}Def ${sumDef}`);
    const killVerdict =
      a.atk != null && haveAny
        ? a.atk >= sumDef
          ? "may wipe"
          : "might not"
        : "—";
    const tradeVerdict =
      attackerDef != null && haveAny
        ? sumAtk >= attackerDef
          ? "attacker may die"
          : "attacker survives"
        : "—";
    return (
      <span className="opacity-70 ml-2">
        · Suggests: <span className="font-medium">{parts.join(" ")}</span> →{" "}
        {killVerdict}; {tradeVerdict}
      </span>
    );
  }

  // Auto-hide summary after longer display (still manually closable)
  useEffect(() => {
    if (!lastCombatSummary) return;
    const id = window.setTimeout(() => setLastCombatSummary(null), 12000);
    return () => window.clearTimeout(id);
  }, [lastCombatSummary, setLastCombatSummary]);

  if (!combatGuidesActive) return null;

  return (
    <>
      {/* Top bar */}
      <div className="fixed inset-x-0 top-6 z-40 pointer-events-none flex justify-center">
        {attackChoice && actorIsActive ? (
          <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-lg md:text-xl flex items-center gap-2">
            <span className="opacity-80">
              {tileNum ? `[T${tileNum}] ` : ""}
              <span
                className="font-fantaisie"
                style={{
                  color:
                    attackChoice.attacker.owner === 1
                      ? PLAYER_COLORS.p1
                      : PLAYER_COLORS.p2,
                }}
              >
                {(() => {
                  try {
                    return (
                      permanents[attackChoice.attacker.at]?.[
                        attackChoice.attacker.index
                      ]?.card?.name || "Unit"
                    );
                  } catch {
                    return "Unit";
                  }
                })()}
              </span>
            </span>
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1"
              onClick={() => {
                try {
                  offerIntercept(attackChoice.tile, attackChoice.attacker);
                } finally {
                  setAttackChoice(null);
                }
              }}
            >
              Moves Only
            </button>
            <button
              className="mx-1 rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1"
              onClick={() => {
                setAttackTargetChoice({
                  tile: attackChoice.tile,
                  attacker: attackChoice.attacker,
                  candidates: [],
                });
                setAttackChoice(null);
              }}
            >
              Moves &amp; Attacks
            </button>
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1"
              onClick={() => {
                setAttackChoice(null);
                requestRevertCrossMove(); // Revert the movement
              }}
            >
              Cancel
            </button>
          </div>
        ) : attackTargetChoice && !attackConfirm ? (
          <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-lg md:text-xl flex items-center gap-2">
            <span className="opacity-80">
              Select a target at{" "}
              <span className="font-fantaisie">T{tileNum}</span>
            </span>
            <button
              className="mx-2 rounded bg-white/15 hover:bg-white/25 px-3 py-1"
              onClick={() => {
                setAttackTargetChoice(null);
              }}
            >
              Cancel
            </button>
          </div>
        ) : attackConfirm ? (
          <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-lg md:text-xl flex items-center gap-2">
            <span className="opacity-80">
              {tileNum ? `[T${tileNum}] ` : ""}
              <span
                className="font-fantaisie"
                style={{
                  color:
                    attackConfirm.attacker.owner === 1
                      ? PLAYER_COLORS.p1
                      : PLAYER_COLORS.p2,
                }}
              >
                {(() => {
                  try {
                    return (
                      permanents[attackConfirm.attacker.at]?.[
                        attackConfirm.attacker.index
                      ]?.card?.name || "Attacker"
                    );
                  } catch {
                    return "Attacker";
                  }
                })()}
              </span>
              {" attacks "}
              <span className="font-fantaisie">
                {attackConfirm.targetLabel}
              </span>
            </span>
            <SuggestionConfirm />
            <button
              className="mx-2 rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1"
              onClick={() => {
                try {
                  declareAttack(
                    attackConfirm.tile,
                    attackConfirm.attacker,
                    attackConfirm.target
                  );
                } finally {
                  setAttackConfirm(null);
                  setAttackTargetChoice(null);
                }
              }}
            >
              Confirm
            </button>
            <button
              className="rounded bg-white/15 hover:bg-white/25 px-3 py-1"
              onClick={() => setAttackConfirm(null)}
            >
              Back
            </button>
          </div>
        ) : pendingCombat &&
          actorKey &&
          pendingCombat.defenderSeat === actorKey ? (
          pendingCombat.status !== "committed" ? (
            <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-lg md:text-xl flex items-center gap-2">
              <span className="opacity-80">
                {pendingCombat.target == null ? (
                  <>
                    Intercept{" "}
                    <span
                      className="font-fantaisie"
                      style={{
                        color:
                          pendingCombat.attacker.owner === 1
                            ? PLAYER_COLORS.p1
                            : PLAYER_COLORS.p2,
                      }}
                    >
                      {attackerLabel || "Attacker"}
                    </span>{" "}
                    with: {pendingCombat.defenders?.length || 0} selected
                    {(pendingCombat.defenders?.length || 0) > 0
                      ? ` – ${defenderNames()}`
                      : ""}
                  </>
                ) : (
                  <>
                    <span
                      className="font-fantaisie"
                      style={{
                        color:
                          pendingCombat.attacker.owner === 1
                            ? PLAYER_COLORS.p1
                            : PLAYER_COLORS.p2,
                      }}
                    >
                      {attackerLabel || "Attacker"}
                    </span>
                    {targetLabel ? ` attacks ` : " attacks"}
                    {targetLabel ? (
                      <span className="font-fantaisie">{targetLabel}</span>
                    ) : null}
                    . Choose defenders: {pendingCombat.defenders?.length || 0}{" "}
                    selected
                    {(pendingCombat.defenders?.length || 0) > 0
                      ? ` – ${defenderNames()}`
                      : ""}
                  </>
                )}
              </span>
              <SuggestionDefense />
              <button
                className="rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1"
                onClick={() => {
                  commitDefenders();
                }}
              >
                Done
              </button>
            </div>
          ) : (
            (() => {
              const isIntercept = !pendingCombat.target;
              if (isIntercept) {
                return (
                  <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-base md:text-lg flex items-center gap-3">
                    <div>Defenders committed.</div>
                    <button
                      className="rounded bg-amber-600/90 hover:bg-amber-500 px-3 py-1 text-sm"
                      onClick={() => autoResolveCombat()}
                    >
                      Auto Resolve
                    </button>
                    <button
                      className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm"
                      onClick={() => cancelCombat()}
                    >
                      Cancel
                    </button>
                  </div>
                );
              }
              return (
                <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-base md:text-lg">
                  Defenders committed. Waiting for attacker…
                </div>
              );
            })()
          )
        ) : pendingCombat &&
          (actorKey ? pendingCombat.defenderSeat !== actorKey : true) ? (
          <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-base md:text-lg flex items-center gap-3">
            <div>
              Defenders:{" "}
              {pendingCombat.defenders?.length ? defenderNames() : "—"}
            </div>
            <SuggestionDefense />
            {pendingCombat.status === "committed"
              ? (() => {
                  const aSeat = seatFromOwner(pendingCombat.attacker.owner) as
                    | "p1"
                    | "p2";
                  const amAttacker = actorKey ? actorKey === aSeat : true;
                  if (!amAttacker) return null;
                  const defs = pendingCombat.defenders || [];
                  if (defs.length <= 1) {
                    return (
                      <>
                        <button
                          className="rounded bg-amber-600/90 hover:bg-amber-500 px-3 py-1 text-sm"
                          onClick={() => autoResolveCombat()}
                        >
                          Auto Resolve
                        </button>
                        <button
                          className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm"
                          onClick={() => cancelCombat()}
                        >
                          Cancel
                        </button>
                      </>
                    );
                  }
                  const eff = computeEffectiveAttack({
                    at: pendingCombat.attacker.at,
                    index: pendingCombat.attacker.index,
                  });
                  const totalAtk = Math.max(0, Math.floor(eff.atk));
                  const sum = (pendingCombat.assignment || []).reduce(
                    (s, a) =>
                      s + Math.max(0, Math.floor(Number(a.amount) || 0)),
                    0
                  );
                  const valid = sum === totalAtk;
                  return (
                    <>
                      <button
                        className="rounded bg-amber-600/90 hover:bg-amber-500 px-3 py-1 text-sm disabled:opacity-50"
                        onClick={() => autoResolveCombat()}
                        disabled={!valid}
                      >
                        Auto Resolve
                      </button>
                      <button
                        className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm"
                        onClick={() => cancelCombat()}
                      >
                        Cancel
                      </button>
                    </>
                  );
                })()
              : null}
          </div>
        ) : null}
      </div>

      {/* Bottom attacker controls */}
      <AttackerAssignmentBar />

      {/* Final summary banner (both players) */}
      {lastCombatSummary
        ? (() => {
            const actor = lastCombatSummary.actor;
            const targetSeat = lastCombatSummary.targetSeat;
            const ac = actor ? PLAYER_COLORS[actor] : "#aaaaaa";
            const tc = targetSeat ? PLAYER_COLORS[targetSeat] : "#aaaaaa";
            return (
              <div className="fixed inset-x-0 top-28 z-40 pointer-events-none flex justify-center">
                <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-base md:text-lg flex items-center gap-3">
                  <div className="min-w-0">
                    {actor || targetSeat ? (
                      <div className="text-xs opacity-90 mb-1">
                        {actor ? (
                          <span style={{ color: ac }} className="font-semibold">
                            {actor.toUpperCase()}
                          </span>
                        ) : null}
                        {actor || targetSeat ? (
                          <span className="mx-1">→</span>
                        ) : null}
                        {targetSeat ? (
                          <span style={{ color: tc }} className="font-semibold">
                            {targetSeat.toUpperCase()}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="leading-tight drop-shadow-sm break-words">
                      {lastCombatSummary.text}
                    </div>
                  </div>
                  <button
                    className="ml-2 rounded bg-white/15 hover:bg-white/25 px-2 py-1 text-sm"
                    onClick={() => setLastCombatSummary(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()
        : null}
    </>
  );
}
