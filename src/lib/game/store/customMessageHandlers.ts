import type { StateCreator } from "zustand";
import { extractMagicTargetingHintsSync } from "@/lib/game/cardAbilities";
import type {
  GameState,
  PlayerKey,
  CellKey,
  Permanents,
  SiteTile,
  CardRef,
  MagicTarget,
} from "./types";
import {
  getCellNumber,
  opponentSeat,
  seatFromOwner,
  toCellKey,
} from "./utils/boardHelpers";

type StoreSet = Parameters<StateCreator<GameState>>[0];
type StoreGet = Parameters<StateCreator<GameState>>[1];

export function handleCustomMessage(
  msg: unknown,
  set: StoreSet,
  get: StoreGet
) {
  if (!msg || typeof msg !== "object") return;
  const t = (msg as { type?: unknown }).type;
  if (typeof t !== "string" || !t) return;
  if (t === "boardPing") {
    const payload = msg as {
      id?: string;
      playerId?: string | null;
      playerKey?: PlayerKey | null;
      position?: { x?: number; z?: number };
      ts?: number;
    };
    get().pushBoardPing({
      id: payload.id ?? String(Math.random()),
      playerId: payload.playerId ?? null,
      playerKey:
        payload.playerKey === "p1" || payload.playerKey === "p2"
          ? payload.playerKey
          : null,
      position: {
        x: Number(payload.position?.x) || 0,
        z: Number(payload.position?.z) || 0,
      },
      ts:
        typeof payload.ts === "number" && Number.isFinite(payload.ts)
          ? payload.ts
          : Date.now(),
    });
    return;
  }
  if (t === "guidePref") {
    const seatRaw = (msg as { seat?: unknown }).seat as unknown;
    const seat =
      seatRaw === "p1" || seatRaw === "p2" ? (seatRaw as PlayerKey) : null;
    if (!seat) return;
    const combat = !!(msg as { combatGuides?: unknown }).combatGuides;
    const magic = !!(msg as { magicGuides?: unknown }).magicGuides;
    set((s) => {
      const prevCombatPrefs = {
        p1: !!s.combatGuideSeatPrefs?.p1,
        p2: !!s.combatGuideSeatPrefs?.p2,
      };
      const prevMagicPrefs = {
        p1: !!s.magicGuideSeatPrefs?.p1,
        p2: !!s.magicGuideSeatPrefs?.p2,
      };
      const nextCombatPrefs = { ...prevCombatPrefs, [seat]: combat } as Record<
        PlayerKey,
        boolean
      >;
      const nextMagicPrefs = { ...prevMagicPrefs, [seat]: magic } as Record<
        PlayerKey,
        boolean
      >;
      const nextCombatActive = nextCombatPrefs.p1 && nextCombatPrefs.p2;
      const nextMagicActive = nextMagicPrefs.p1 && nextMagicPrefs.p2;
      return {
        combatGuideSeatPrefs: nextCombatPrefs,
        magicGuideSeatPrefs: nextMagicPrefs,
        combatGuidesActive: nextCombatActive,
        magicGuidesActive: nextMagicActive,
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "magicDamage") {
    const dmgAny = (msg as { damage?: unknown }).damage as unknown;
    if (!Array.isArray(dmgAny)) return;
    const mySeat = get().actorKey as PlayerKey | null;
    for (const d of dmgAny) {
      if (!d || typeof d !== "object") continue;
      const rec = d as Record<string, unknown>;
      const kind = typeof rec.kind === "string" ? (rec.kind as string) : "";
      const amt = Number(rec.amount);
      if (!Number.isFinite(amt)) continue;
      if (kind === "permanent") {
        const at = typeof rec.at === "string" ? (rec.at as string) : "";
        const idx = Number(rec.index);
        if (!at || !Number.isFinite(idx)) continue;
        try {
          const ownerNum = (get().permanents as Permanents)[at]?.[Number(idx)]
            ?.owner;
          const ownerSeat =
            ownerNum === 1 ? "p1" : ownerNum === 2 ? "p2" : null;
          if (mySeat && ownerSeat === mySeat) {
            get().applyDamageToPermanent(
              at as CellKey,
              Number(idx),
              Math.max(0, Math.floor(amt))
            );
          }
        } catch {}
      } else if (kind === "avatar") {
        const seat = (rec.seat as PlayerKey | undefined) ?? undefined;
        if (seat && mySeat && seat === mySeat) {
          try {
            get().addLife(seat, -Math.max(0, Math.floor(amt)));
          } catch {}
        }
      }
    }
    return;
  }
  if (t === "magicBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const tile = (msg as { tile?: unknown }).tile as
      | { x?: unknown; y?: unknown }
      | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    if (!id || !tile || typeof spellAny !== "object") return;
    const x = Number(tile?.x);
    const y = Number(tile?.y);
    const rec = spellAny as Record<string, unknown>;
    const at = typeof rec.at === "string" ? (rec.at as string) : null;
    const idx = Number(rec.index);
    const ownerVal = Number(rec.owner);
    const card = rec.card as CardRef | undefined;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !at ||
      !Number.isFinite(idx) ||
      !(ownerVal === 1 || ownerVal === 2) ||
      !card
    )
      return;
    const cardName = card?.name || "";
    const hints = extractMagicTargetingHintsSync(cardName, null);
    const magicGuidesActive = get().magicGuidesActive;
    set({
      pendingMagic: {
        id: String(id),
        tile: { x, y },
        spell: {
          at: at as CellKey,
          index: Number(idx),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: ownerVal as 1 | 2,
          card: card as CardRef,
        },
        caster: null,
        target: null,
        status: "choosingCaster",
        hints,
        createdAt: Date.now(),
        guidesSuppressed: !magicGuidesActive,
      },
    } as Partial<GameState> as GameState);
    return;
  }
  if (t === "magicSetCaster") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterAny = (msg as { caster?: unknown }).caster as unknown;
    set((s) => {
      if (!id || !s.pendingMagic || s.pendingMagic.id !== id)
        return s as GameState;
      let caster:
        | { kind: "avatar"; seat: PlayerKey }
        | { kind: "permanent"; at: CellKey; index: number; owner: 1 | 2 }
        | null = null;
      try {
        if (casterAny && typeof casterAny === "object") {
          const c = casterAny as Record<string, unknown>;
          const kind =
            c.kind === "avatar" || c.kind === "permanent"
              ? (c.kind as "avatar" | "permanent")
              : null;
          if (kind === "avatar")
            caster = { kind: "avatar", seat: c.seat as PlayerKey };
          if (kind === "permanent")
            caster = {
              kind: "permanent",
              at: c.at as CellKey,
              index: Number(c.index),
              owner: Number(c.owner) as 1 | 2,
            };
        }
      } catch {}
      return {
        pendingMagic: {
          ...s.pendingMagic,
          caster: caster ?? null,
          status: caster ? "choosingTarget" : "choosingCaster",
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "magicSetTarget") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const targetAny = (msg as { target?: unknown }).target as unknown;
    set((s) => {
      if (!id || !s.pendingMagic || s.pendingMagic.id !== id)
        return s as GameState;
      let target: MagicTarget | null = null;
      try {
        if (targetAny && typeof targetAny === "object") {
          const rec = targetAny as Record<string, unknown>;
          const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
          if (k === "location")
            target = { kind: "location", at: rec.at as CellKey };
          else if (k === "permanent")
            target = {
              kind: "permanent",
              at: rec.at as CellKey,
              index: Number(rec.index),
            };
          else if (k === "avatar")
            target = { kind: "avatar", seat: rec.seat as PlayerKey };
          else if (k === "projectile") {
            const dir = rec.direction as "N" | "E" | "S" | "W";
            let firstHit:
              | { kind: "permanent" | "avatar"; at: CellKey; index?: number }
              | undefined = undefined;
            try {
              const fh = rec.firstHit as Record<string, unknown> | undefined;
              if (fh && typeof fh === "object") {
                const kind =
                  fh.kind === "permanent" || fh.kind === "avatar"
                    ? (fh.kind as "permanent" | "avatar")
                    : null;
                if (kind === "permanent")
                  firstHit = {
                    kind: "permanent",
                    at: fh.at as CellKey,
                    index: Number(fh.index),
                  };
                else if (kind === "avatar")
                  firstHit = { kind: "avatar", at: fh.at as CellKey };
              }
            } catch {}
            let intended:
              | (
                  | { kind: "permanent"; at: CellKey; index: number }
                  | { kind: "avatar"; seat: PlayerKey }
                )
              | undefined = undefined;
            try {
              const it = rec.intended as Record<string, unknown> | undefined;
              if (it && typeof it === "object") {
                const kind =
                  it.kind === "permanent" || it.kind === "avatar"
                    ? (it.kind as "permanent" | "avatar")
                    : null;
                if (kind === "permanent")
                  intended = {
                    kind: "permanent",
                    at: it.at as CellKey,
                    index: Number(it.index),
                  };
                else if (kind === "avatar")
                  intended = { kind: "avatar", seat: it.seat as PlayerKey };
              }
            } catch {}
            target = { kind: "projectile", direction: dir, firstHit, intended };
          }
        }
      } catch {}
      // Do not auto-confirm on target set; wait for explicit confirm
      return {
        pendingMagic: { ...s.pendingMagic, target, status: "choosingTarget" },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "magicConfirm") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!id || !s.pendingMagic || s.pendingMagic.id !== id)
        return s as GameState;
      return {
        pendingMagic: { ...s.pendingMagic, status: "confirm" },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "magicResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    if (!id || !spellAny || typeof spellAny !== "object") return;
    const rec = spellAny as Record<string, unknown>;
    const at = typeof rec.at === "string" ? (rec.at as string) : null;
    const idx = Number(rec.index);
    const ownerVal = Number(rec.owner);
    const mySeat = get().actorKey as PlayerKey | null;
    const ownerSeat = ownerVal === 1 ? "p1" : ownerVal === 2 ? "p2" : null;
    // Only the owning seat applies the zone change locally to avoid double patches
    if (
      at &&
      Number.isFinite(idx) &&
      mySeat &&
      ownerSeat &&
      mySeat === ownerSeat
    ) {
      try {
        get().movePermanentToZone(at as CellKey, Number(idx), "graveyard");
      } catch {}
    }
    set((s) => {
      if (!s.pendingMagic || s.pendingMagic.id !== id) return s as GameState;
      return { pendingMagic: null } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "magicSummary") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const text = (msg as { text?: unknown }).text as string | undefined;
    if (typeof text === "string") {
      try {
        get().log(text);
      } catch {}
    }
    set((s) => {
      if (!id || !s.pendingMagic || s.pendingMagic.id !== id)
        return s as GameState;
      return {
        pendingMagic: {
          ...s.pendingMagic,
          status: "confirm",
          summaryText: text ?? s.pendingMagic.summaryText ?? null,
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "magicCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    if (spellAny && typeof spellAny === "object") {
      const rec = spellAny as Record<string, unknown>;
      const at = typeof rec.at === "string" ? (rec.at as string) : null;
      const idx = Number(rec.index);
      const ownerVal = Number(rec.owner);
      const mySeat = get().actorKey as PlayerKey | null;
      const ownerSeat = ownerVal === 1 ? "p1" : ownerVal === 2 ? "p2" : null;
      if (
        at &&
        Number.isFinite(idx) &&
        mySeat &&
        ownerSeat &&
        mySeat === ownerSeat
      ) {
        try {
          get().movePermanentToZone(at as CellKey, Number(idx), "hand");
        } catch {}
      }
    }
    set((s) => {
      if (!s.pendingMagic || (id && s.pendingMagic.id !== id))
        return s as GameState;
      return { pendingMagic: null } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "interceptOffer") {
    const idRaw = (msg as { id?: unknown }).id as string | undefined;
    const tile = (msg as { tile?: unknown }).tile as
      | { x?: unknown; y?: unknown }
      | undefined;
    const attacker = (msg as { attacker?: unknown }).attacker as
      | { at?: unknown; index?: unknown; instanceId?: unknown; owner?: unknown }
      | undefined;
    const x = Number(tile?.x);
    const y = Number(tile?.y);
    const at =
      typeof attacker?.at === "string" ? (attacker?.at as string) : null;
    const indexVal = Number(attacker?.index);
    const ownerVal = Number(attacker?.owner);
    const id =
      typeof idRaw === "string" && idRaw
        ? idRaw
        : `cmb_${Date.now().toString(36)}`;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !at ||
      !Number.isFinite(indexVal) ||
      !Number.isFinite(ownerVal)
    )
      return;
    const defenderSeat =
      ownerVal === 1 || ownerVal === 2
        ? opponentSeat(seatFromOwner(ownerVal as 1 | 2))
        : "p1";
    const mySeat = get().actorKey as PlayerKey | null;
    // Show intercept chooser only to defender seat, or in hotseat (no actorKey)
    if (mySeat && mySeat !== defenderSeat) return;
    set({
      pendingCombat: {
        id: String(id),
        tile: { x, y },
        attacker: {
          at,
          index: Number(indexVal),
          instanceId: (attacker?.instanceId as string | null) ?? null,
          owner: ownerVal as 1 | 2,
        },
        target: null,
        defenderSeat,
        defenders: [],
        status: "defending",
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log("Intercept opportunity: choose interceptors");
    } catch {}
    return;
  }
  if (t === "toast") {
    const text = (msg as { text?: unknown }).text;
    const cellKey = (msg as { cellKey?: unknown }).cellKey as
      | string
      | undefined;
    // Server sends playerKey, client sends seat - check both
    const seat = ((msg as { seat?: unknown }).seat ||
      (msg as { playerKey?: unknown }).playerKey) as string | undefined;
    if (typeof text === "string" && text.trim().length > 0) {
      // Don't log toast messages as events - the original action already logs the event.
      // Toast is just for visual notification to the opponent.
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: { message: text, cellKey, seat },
            })
          );
        }
      } catch {}
    }
    return;
  }
  if (t === "combatCommit") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const defendersAny = (msg as { defenders?: unknown }).defenders as unknown;
    const targetAny = (msg as { target?: unknown }).target as unknown;
    const tileMsg = (msg as { tile?: unknown }).tile as
      | { x?: unknown; y?: unknown }
      | undefined;
    if (!id) return;
    let defenders: Array<{
      at: CellKey;
      index: number;
      owner: 1 | 2;
      instanceId: string | null;
    }> = [];
    if (Array.isArray(defendersAny)) {
      defenders = defendersAny
        .filter((d) => d && typeof d === "object")
        .map((d) => d as Record<string, unknown>)
        .map((rec) => {
          const at = typeof rec.at === "string" ? (rec.at as string) : null;
          const idx = Number(rec.index);
          const ownerVal = Number(rec.owner);
          const instanceId =
            typeof rec.instanceId === "string"
              ? (rec.instanceId as string)
              : null;
          if (!at || !Number.isFinite(idx) || !Number.isFinite(ownerVal))
            return null;
          return {
            at: at as CellKey,
            index: Number(idx),
            owner: ownerVal as 1 | 2,
            instanceId,
          };
        })
        .filter(Boolean) as Array<{
        at: CellKey;
        index: number;
        owner: 1 | 2;
        instanceId: string | null;
      }>;
    }
    let target: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    } | null = null;
    try {
      if (targetAny && typeof targetAny === "object") {
        const rec = targetAny as Record<string, unknown>;
        const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
        const a = typeof rec.at === "string" ? (rec.at as string) : "";
        const idx = rec.index == null ? null : Number(rec.index);
        const ok = k === "permanent" || k === "avatar" || k === "site";
        if (ok && a && (idx === null || Number.isFinite(idx))) {
          const kind = k as "permanent" | "avatar" | "site";
          target = { kind, at: a as CellKey, index: idx };
        }
      }
    } catch {}
    const x = Number(tileMsg?.x);
    const y = Number(tileMsg?.y);
    set((s) => {
      if (!s.pendingCombat || s.pendingCombat.id !== id) return s as GameState;
      return {
        pendingCombat: {
          ...s.pendingCombat,
          defenders,
          target: target ?? s.pendingCombat.target,
          tile:
            Number.isFinite(x) && Number.isFinite(y)
              ? { x, y }
              : s.pendingCombat.tile,
          status: "committed",
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "combatAssign") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const asgnAny = (msg as { assignment?: unknown }).assignment as unknown;
    if (!id || !Array.isArray(asgnAny)) return;
    const records = asgnAny
      .filter((a) => a && typeof a === "object")
      .map((a) => a as Record<string, unknown>);
    const asgn = records
      .map((rec) => {
        const at = typeof rec.at === "string" ? (rec.at as string) : null;
        const idx = Number(rec.index);
        const amt = Number(rec.amount);
        if (!at || !Number.isFinite(idx) || !Number.isFinite(amt)) return null;
        return {
          at: at as CellKey,
          index: Number(idx),
          amount: Math.max(0, Math.floor(amt)),
        };
      })
      .filter(Boolean) as Array<{ at: CellKey; index: number; amount: number }>;
    set((s) => {
      if (!s.pendingCombat || s.pendingCombat.id !== id) return s as GameState;
      return {
        pendingCombat: { ...s.pendingCombat, assignment: asgn },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "combatDamage") {
    const dmgAny = (msg as { damage?: unknown }).damage as unknown;
    if (!Array.isArray(dmgAny)) return;
    const mySeat = get().actorKey as PlayerKey | null;
    for (const d of dmgAny) {
      if (!d || typeof d !== "object") continue;
      const rec = d as Record<string, unknown>;
      const at = typeof rec.at === "string" ? (rec.at as string) : "";
      const idx = Number(rec.index);
      const amt = Number(rec.amount);
      if (!at || !Number.isFinite(idx) || !Number.isFinite(amt)) continue;
      try {
        const ownerNum = (get().permanents as Permanents)[at]?.[Number(idx)]
          ?.owner;
        const ownerSeat = ownerNum === 1 ? "p1" : ownerNum === 2 ? "p2" : null;
        if (!mySeat || ownerSeat !== mySeat) continue;
        get().applyDamageToPermanent(
          at as CellKey,
          Number(idx),
          Math.max(0, Math.floor(amt))
        );
      } catch {}
    }
    return;
  }
  if (t === "combatAutoApply") {
    const killsAny = (msg as { kills?: unknown }).kills as unknown;
    console.log("[combatAutoApply] Received kills:", killsAny);
    if (Array.isArray(killsAny)) {
      const mySeat = get().actorKey as PlayerKey | null;
      console.log(
        "[combatAutoApply] mySeat:",
        mySeat,
        "kills count:",
        killsAny.length
      );

      // Parse kills and filter to only my kills
      // If mySeat is not set, fall back to checking permanent ownership directly
      const parsedKills = killsAny
        .filter((k): k is Record<string, unknown> => k && typeof k === "object")
        .map((rec) => ({
          at: typeof rec.at === "string" ? (rec.at as string) : "",
          index: Number(rec.index),
          owner: (rec.owner as PlayerKey | undefined) ?? undefined,
          instanceId:
            typeof rec.instanceId === "string" ? rec.instanceId : null,
        }));

      console.log("[combatAutoApply] Parsed kills:", parsedKills);

      const myKills = parsedKills
        .filter((k) => {
          if (!k.at || !Number.isFinite(k.index)) {
            console.log("[combatAutoApply] Skipping invalid kill:", k);
            return false;
          }
          // If mySeat is set, use it for filtering
          if (mySeat) {
            const matches = k.owner === mySeat;
            console.log(
              `[combatAutoApply] Kill owner=${k.owner}, mySeat=${mySeat}, matches=${matches}`
            );
            return matches;
          }
          // Fallback if mySeat is not set: check if permanent exists and owner matches
          // This allows kills to be applied even if actorKey isn't set yet
          try {
            const perm = (get().permanents as Permanents)[k.at]?.[k.index];
            if (!perm) return false;
            const permOwner =
              perm.owner === 1 ? "p1" : perm.owner === 2 ? "p2" : null;
            // Apply kill if the permanent exists with matching owner
            // This is safe because only one client should have this permanent
            if (permOwner === k.owner) {
              console.log(
                "[combatAutoApply] Fallback: applying kill for owner",
                k.owner,
                "without mySeat"
              );
              return true;
            }
            return false;
          } catch {
            return false;
          }
        })
        // Sort by index descending within each cell to avoid index shifting
        .sort((a, b) => {
          if (a.at !== b.at) return 0;
          return b.index - a.index;
        });

      for (const kill of myKills) {
        console.log("[combatAutoApply] Processing kill:", kill);
        try {
          // Find current index by instanceId if available
          let currentIndex = kill.index;
          if (kill.instanceId) {
            const permanents = get().permanents as Permanents;
            const list = permanents[kill.at] || [];
            const foundIdx = list.findIndex(
              (p) => p.instanceId === kill.instanceId
            );
            if (foundIdx >= 0) {
              currentIndex = foundIdx;
              console.log(
                "[combatAutoApply] Found by instanceId at index:",
                currentIndex
              );
            } else {
              console.warn(
                "[combatAutoApply] Permanent not found by instanceId, using original index:",
                kill
              );
            }
          }
          console.log(
            "[combatAutoApply] Applying kill to graveyard:",
            kill.at,
            currentIndex
          );
          get().movePermanentToZone(
            kill.at as CellKey,
            currentIndex,
            "graveyard"
          );
        } catch (err) {
          console.error("[combatAutoApply] Error moving to graveyard:", err);
        }
      }
    }
    return;
  }

  if (t === "combatSummary") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const text = (msg as { text?: unknown }).text as string | undefined;
    const actor = (msg as { actor?: unknown }).actor as PlayerKey | undefined;
    const targetSeat = (msg as { targetSeat?: unknown }).targetSeat as
      | PlayerKey
      | undefined;
    console.log("[combatSummary] Received:", {
      id,
      text,
      actor,
      targetSeat,
      mySeat: get().actorKey,
    });
    if (id && typeof text === "string") {
      console.log("[combatSummary] Setting lastCombatSummary");
      set({
        lastCombatSummary: { id, text, ts: Date.now(), actor, targetSeat },
        pendingCombat: null,
      } as Partial<GameState> as GameState);
    } else {
      console.warn("[combatSummary] Missing id or text, not setting summary");
    }
    return;
  }
  if (t === "attackDeclare") {
    const id = (msg as { id?: unknown }).id;
    const tile = (msg as { tile?: unknown }).tile as
      | { x?: unknown; y?: unknown }
      | undefined;
    const attacker = (msg as { attacker?: unknown }).attacker as
      | {
          at?: unknown;
          index?: unknown;
          instanceId?: unknown;
          owner?: unknown;
          isAvatar?: unknown;
          avatarSeat?: unknown;
        }
      | undefined;
    const targetAny = (msg as { target?: unknown }).target as unknown;
    const x = Number(tile?.x);
    const y = Number(tile?.y);
    const at =
      typeof attacker?.at === "string" ? (attacker?.at as string) : null;
    const indexVal = Number(attacker?.index);
    const ownerVal = Number(attacker?.owner);
    const isAvatarAttacker = Boolean(attacker?.isAvatar);
    const avatarSeatVal =
      typeof attacker?.avatarSeat === "string"
        ? (attacker.avatarSeat as PlayerKey)
        : undefined;
    if (
      !id ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !at ||
      !Number.isFinite(indexVal) ||
      !Number.isFinite(ownerVal)
    )
      return;
    const defenderSeat =
      ownerVal === 1 || ownerVal === 2
        ? opponentSeat(seatFromOwner(ownerVal as 1 | 2))
        : "p1";
    let target: {
      kind: "permanent" | "avatar" | "site";
      at: CellKey;
      index: number | null;
    } | null = null;
    try {
      if (targetAny && typeof targetAny === "object") {
        const rec = targetAny as Record<string, unknown>;
        const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
        const a = typeof rec.at === "string" ? (rec.at as string) : "";
        const idx = rec.index == null ? null : Number(rec.index);
        const okKind = k === "permanent" || k === "avatar" || k === "site";
        if (okKind && a && (idx === null || Number.isFinite(idx))) {
          target = {
            kind: k as "permanent" | "avatar" | "site",
            at: a as CellKey,
            index: idx as number | null,
          };
        }
      }
    } catch {}
    set({
      pendingCombat: {
        id: String(id),
        tile: { x, y },
        attacker: {
          at,
          index: Number(indexVal),
          instanceId: (attacker?.instanceId as string | null) ?? null,
          owner: ownerVal as 1 | 2,
          isAvatar: isAvatarAttacker || undefined,
          avatarSeat: avatarSeatVal,
        },
        target,
        defenderSeat,
        defenders: [],
        status: "declared",
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      const cellNo = getCellNumber(x, y, get().board.size.w);
      get().log(`Attack declared at #${cellNo}`);
    } catch {}
    return;
  }
  if (t === "combatSetDefenders") {
    const id = (msg as { id?: unknown }).id;
    const defendersAny = (msg as { defenders?: unknown }).defenders as unknown;
    if (!id || !Array.isArray(defendersAny)) return;
    const records = defendersAny
      .filter((d) => d && typeof d === "object")
      .map((d) => d as Record<string, unknown>);
    const defenders = records
      .map((rec) => {
        const at = typeof rec.at === "string" ? (rec.at as string) : null;
        const indexVal = Number(rec.index);
        const ownerVal = Number(rec.owner);
        const instanceId =
          typeof rec.instanceId === "string"
            ? (rec.instanceId as string)
            : null;
        if (!at || !Number.isFinite(indexVal) || !Number.isFinite(ownerVal))
          return null;
        return {
          at,
          index: Number(indexVal),
          owner: ownerVal as 1 | 2,
          instanceId: instanceId ?? null,
        };
      })
      .filter(
        (
          x
        ): x is {
          at: CellKey;
          index: number;
          owner: 1 | 2;
          instanceId: string | null;
        } => Boolean(x)
      );
    set((s) => {
      if (!s.pendingCombat || s.pendingCombat.id !== (id as string))
        return s as GameState;
      const prev = s.pendingCombat.status;
      return {
        pendingCombat: {
          ...s.pendingCombat,
          defenders,
          status: prev === "committed" ? "committed" : "defending",
        },
      } as Partial<GameState> as GameState;
    });
    try {
      get().log(
        `Acting player selected ${defenders.length} defender${
          defenders.length === 1 ? "" : "s"
        }`
      );
    } catch {}
    return;
  }
  if (t === "combatResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const attacker = (msg as { attacker?: unknown }).attacker as
      | {
          at?: unknown;
          index?: unknown;
          owner?: unknown;
          isAvatar?: unknown;
          avatarSeat?: unknown;
        }
      | undefined;
    const defendersAny = (msg as { defenders?: unknown }).defenders as
      | unknown[]
      | undefined;
    const targetAny = (msg as { target?: unknown }).target as unknown;
    const tileMsg = (msg as { tile?: unknown }).tile as
      | { x?: unknown; y?: unknown }
      | undefined;
    // Check if attacker is an avatar
    const isAvatarAttacker = Boolean(attacker?.isAvatar);
    const avatarSeat =
      typeof attacker?.avatarSeat === "string"
        ? (attacker.avatarSeat as PlayerKey)
        : null;
    // Set taps idempotently: attacker taps on attack; defenders remain unchanged
    const aAt =
      typeof attacker?.at === "string" ? (attacker.at as string) : null;
    const aIdx = Number(attacker?.index);
    // Don't tap avatar attackers as permanents
    if (aAt && Number.isFinite(aIdx) && !isAvatarAttacker) {
      try {
        get().setTapPermanent(aAt as CellKey, Number(aIdx), true);
      } catch {}
    }
    // Do not tap defenders here
    const defenders = Array.isArray(defendersAny) ? defendersAny : [];
    // Compute a fallback summary so both players see outcome even if a separate summary message is delayed
    try {
      const permanents = get().permanents as Permanents;
      const meta = get().metaByCardId as Record<
        number,
        { attack: number | null; defence: number | null; cost: number | null }
      >;
      const board = get().board;
      const players = get().players;
      function getAtkDef(
        at: string,
        index: number
      ): { atk: number; def: number } {
        try {
          const cardId = permanents[at]?.[index]?.card?.cardId;
          const m = cardId ? meta[Number(cardId)] : undefined;
          const atk = Number(m?.attack ?? 0) || 0;
          const def = Number(m?.defence ?? m?.attack ?? 0) || 0;
          return { atk, def };
        } catch {
          return { atk: 0, def: 0 };
        }
      }
      function getAttachments(at: string, index: number): Permanents[string] {
        const list = permanents[at] || [];
        return list.filter(
          (p) =>
            p.attachedTo &&
            p.attachedTo.at === at &&
            p.attachedTo.index === index
        );
      }
      function listAttachmentEffects(at: string, index: number): string[] {
        const effects: string[] = [];
        for (const t of getAttachments(at, index)) {
          const nm = (t.card?.name || "").trim();
          const low = nm.toLowerCase();
          if (low === "lance") effects.push("Lance(+1, FS)");
          else if (low === "disabled") effects.push("Disabled(Atk=0)");
          else if (nm) effects.push(nm);
        }
        return effects;
      }
      function getPermName(at: string, index: number): string {
        try {
          return permanents[at]?.[index]?.card?.name || "Unit";
        } catch {
          return "Unit";
        }
      }
      function getAvatarName(seat: PlayerKey): string {
        try {
          return (get().avatars?.[seat]?.card?.name as string) || "Avatar";
        } catch {
          return "Avatar";
        }
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
        for (const tkn of attachments) {
          const nm = (tkn.card?.name || "").toLowerCase();
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
      const aCell =
        aAt && Number.isFinite(aIdx) && !isAvatarAttacker
          ? { at: aAt as CellKey, index: Number(aIdx) }
          : null;
      // For avatar attackers, get attack from avatar card
      const eff = (() => {
        if (isAvatarAttacker && avatarSeat) {
          const avatarCard = get().avatars?.[avatarSeat]?.card;
          const cardId = avatarCard?.cardId;
          if (cardId && meta[Number(cardId)]) {
            const atk = Number(meta[Number(cardId)].attack ?? 0) || 0;
            return { atk, firstStrike: false };
          }
          return { atk: 0, firstStrike: false };
        }
        return aCell
          ? computeEffectiveAttack(aCell)
          : { atk: 0, firstStrike: false };
      })();
      // For avatar attackers, use avatar name and skip attachments
      const attackerName =
        isAvatarAttacker && avatarSeat
          ? getAvatarName(avatarSeat)
          : aCell
          ? getPermName(aCell.at, aCell.index)
          : "Attacker";
      // Avatars don't have attachments
      const atkFx = isAvatarAttacker
        ? []
        : aCell
        ? listAttachmentEffects(aCell.at, aCell.index)
        : [];
      const fxTxt = atkFx.length ? ` [${atkFx.join(", ")}]` : "";
      const fsTag = eff.firstStrike ? " (FS)" : "";
      const attackerOwner = Number(attacker?.owner);
      let actorSeat: PlayerKey = "p2";
      if (attackerOwner === 1 || attackerOwner === 2) {
        actorSeat = seatFromOwner(attackerOwner as 1 | 2);
      }
      let targetSeat: PlayerKey | undefined = undefined;
      // Parse optional target
      let target: {
        kind: "permanent" | "avatar" | "site";
        at: CellKey;
        index: number | null;
      } | null = null;
      if (targetAny && typeof targetAny === "object") {
        const rec = targetAny as Record<string, unknown>;
        const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
        const a = typeof rec.at === "string" ? (rec.at as string) : "";
        const idx = rec.index == null ? null : Number(rec.index);
        const okKind = k === "permanent" || k === "avatar" || k === "site";
        if (okKind && a && (idx === null || Number.isFinite(idx))) {
          target = {
            kind: k as "permanent" | "avatar" | "site",
            at: a as CellKey,
            index: idx as number | null,
          };
        }
      }
      let summary = "Combat resolved";
      const tileNo = (() => {
        try {
          const x = Number(tileMsg?.x);
          const y = Number(tileMsg?.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            return getCellNumber(x, y, get().board.size.w);
          }
        } catch {}
        return null as number | null;
      })();
      if (target && target.kind === "site") {
        const owner = board.sites[target.at]?.owner as 1 | 2 | undefined;
        let seat: PlayerKey | null = null;
        if (owner === 1 || owner === 2) {
          seat = seatFromOwner(owner);
        } else {
          seat =
            (get().pendingCombat?.defenderSeat as PlayerKey | null) ??
            opponentSeat(actorSeat);
        }
        if (seat) {
          targetSeat = seat as PlayerKey;
          const dd = players[seat].lifeState === "dd";
          const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
          const siteName = board.sites[target.at]?.card?.name || "Site";
          const ddNote = dd ? " (DD rule)" : "";
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${
            tileNo ?? "?"
          } → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
        }
      } else if (target && target.kind === "avatar") {
        const seat = opponentSeat(actorSeat);
        targetSeat = seat;
        const state = players[seat];
        const avatarName = getAvatarName(seat);
        if (state.lifeState === "dd") {
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${
            tileNo ?? "?"
          } → Expected: ${seat.toUpperCase()} to 0 (lethal from DD, match ends)`;
        } else {
          const life = Number(state.life) || 0;
          const dmg = Math.max(0, Math.floor(eff.atk));
          const next = Math.max(0, life - dmg);
          if (life > 0 && next <= 0) {
            summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${
              tileNo ?? "?"
            } → Expected: reaches Death's Door; further avatar/site damage this turn won't reduce life`;
          } else {
            summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${
              tileNo ?? "?"
            } → Expected: ${dmg} dmg (life ${life} → ${next})`;
          }
        }
      } else {
        const tileKey = (() => {
          try {
            const x = Number(tileMsg?.x);
            const y = Number(tileMsg?.y);
            if (Number.isFinite(x) && Number.isFinite(y))
              return toCellKey(x, y) as CellKey;
          } catch {}
          return null as CellKey | null;
        })();
        const siteAtTile = tileKey
          ? (board.sites[tileKey] as SiteTile | undefined)
          : undefined;
        if (
          !target &&
          siteAtTile &&
          siteAtTile.card &&
          defenders.length === 0
        ) {
          const owner = siteAtTile.owner as 1 | 2 | undefined;
          let seat: PlayerKey | null =
            owner === 1 || owner === 2
              ? seatFromOwner(owner)
              : (get().pendingCombat?.defenderSeat as PlayerKey | null);
          if (!seat) seat = opponentSeat(actorSeat);
          if (seat) {
            targetSeat = seat as PlayerKey;
            const dd = players[seat].lifeState === "dd";
            const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
            const siteName = siteAtTile.card?.name || "Site";
            const ddNote = dd ? " (DD rule)" : "";
            summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${
              tileNo ?? "?"
            } → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
          }
        } else {
          const aAtk = eff.atk;
          let targetDef = 0;
          let targetName = "target";
          if (target && target.kind === "permanent" && target.index != null) {
            targetDef = getAtkDef(target.at, target.index).def;
            targetName = getPermName(target.at, target.index);
          } else if (defenders.length > 0) {
            const defRecs: Record<string, unknown>[] = (defenders as unknown[])
              .filter((d: unknown) => d && typeof d === "object")
              .map((d: unknown) => d as Record<string, unknown>);
            targetDef = 0;
            for (const rec of defRecs) {
              const at = typeof rec.at === "string" ? (rec.at as string) : "";
              const idx = Number(rec.index);
              if (at && Number.isFinite(idx))
                targetDef += getAtkDef(at, Number(idx)).def;
            }
            const names: string[] = [];
            for (const rec of defRecs.slice(0, 3)) {
              const at = typeof rec.at === "string" ? (rec.at as string) : "";
              const idx = Number(rec.index);
              if (at && Number.isFinite(idx))
                names.push(getPermName(at, Number(idx)));
            }
            targetName = names.join(", ") + (defenders.length > 3 ? ", …" : "");
          }
          const kills = aAtk >= targetDef;
          targetSeat =
            ((get().pendingCombat?.defenderSeat ?? null) as PlayerKey | null) ||
            undefined;
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} vs ${targetName} @#${
            tileNo ?? "?"
          } → Expected: Atk ${aAtk} vs Def ${targetDef} (${
            kills ? "likely kill" : "may fail"
          })`;
        }
      }
      // Don't set lastCombatSummary here - the authoritative summary comes from
      // the combatSummary message, not from combatResolve. Just clear pending state.
      void id;
      void targetSeat;
      void summary;
      set({ pendingCombat: null } as Partial<GameState> as GameState);
    } catch {
      set({ pendingCombat: null } as Partial<GameState> as GameState);
    }
    // Note: The actual summary is sent via combatSummary message and displayed in the HUD
    return;
  }
  if (t === "combatCancel") {
    set({ pendingCombat: null });
    try {
      get().log("Combat cancelled");
    } catch {}
    return;
  }
  // --- Chaos Twister message handlers ---
  if (t === "chaosTwisterBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    if (!id || !spellAny || !casterSeat) return;
    const rec = spellAny as Record<string, unknown>;
    set({
      pendingChaosTwister: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "selectingMinion",
        targetMinion: null,
        targetSite: null,
        minigameResult: null,
        landingSite: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    return;
  }
  if (t === "chaosTwisterSelectMinion") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const minionAny = (msg as { minion?: unknown }).minion as unknown;
    if (!id || !minionAny) return;
    const rec = minionAny as Record<string, unknown>;
    set((s) => {
      if (!s.pendingChaosTwister || s.pendingChaosTwister.id !== id)
        return s as GameState;
      return {
        pendingChaosTwister: {
          ...s.pendingChaosTwister,
          targetMinion: {
            at: rec.at as CellKey,
            index: Number(rec.index),
            card: rec.card as CardRef,
            power: Number(rec.power),
          },
          phase: "selectingSite",
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "chaosTwisterSelectSite") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const siteAny = (msg as { site?: unknown }).site as unknown;
    if (!id || !siteAny) return;
    const rec = siteAny as Record<string, unknown>;
    set((s) => {
      if (!s.pendingChaosTwister || s.pendingChaosTwister.id !== id)
        return s as GameState;
      return {
        pendingChaosTwister: {
          ...s.pendingChaosTwister,
          targetSite: {
            x: Number(rec.x),
            y: Number(rec.y),
            cellKey: rec.cellKey as CellKey,
          },
          phase: "minigame",
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "chaosTwisterMinigameResult") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const resultAny = (msg as { result?: unknown }).result as unknown;
    const landingSiteAny = (msg as { landingSite?: unknown })
      .landingSite as unknown;
    if (!id || !resultAny || !landingSiteAny) return;
    const resultRec = resultAny as Record<string, unknown>;
    const landingRec = landingSiteAny as Record<string, unknown>;
    set((s) => {
      if (!s.pendingChaosTwister || s.pendingChaosTwister.id !== id)
        return s as GameState;
      return {
        pendingChaosTwister: {
          ...s.pendingChaosTwister,
          minigameResult: {
            accuracy: resultRec.accuracy as "green" | "yellow" | "red",
            hitPosition: Number(resultRec.hitPosition),
            landingOffset: Number(resultRec.landingOffset),
          },
          landingSite: {
            x: Number(landingRec.x),
            y: Number(landingRec.y),
            cellKey: landingRec.cellKey as CellKey,
          },
          phase: "resolving",
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "chaosTwisterResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const power = (msg as { power?: unknown }).power as number | undefined;
    const landingSiteAny = (msg as { landingSite?: unknown })
      .landingSite as unknown;
    const damageRecordsAny = (msg as { damageRecords?: unknown })
      .damageRecords as unknown;

    const pending = get().pendingChaosTwister;
    if (!pending || (id && pending.id !== id)) return;

    // Apply damage to units at landing site (same logic as local resolve)
    if (power != null && landingSiteAny) {
      // Apply damage to all minions at landing site
      if (Array.isArray(damageRecordsAny)) {
        for (const rec of damageRecordsAny) {
          const r = rec as { at: CellKey; index: number };
          get().applyDamageToPermanent(r.at, r.index, power);
        }
      }

      // Apply damage to the blown minion itself
      if (pending.targetMinion) {
        get().applyDamageToPermanent(
          pending.targetMinion.at,
          pending.targetMinion.index,
          power
        );
      }

      // Move spell to graveyard
      try {
        get().movePermanentToZone(
          pending.spell.at,
          pending.spell.index,
          "graveyard"
        );
      } catch {}
    }

    set({ pendingChaosTwister: null } as Partial<GameState> as GameState);
    return;
  }
  if (t === "chaosTwisterCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingChaosTwister || (id && s.pendingChaosTwister.id !== id))
        return s as GameState;
      return { pendingChaosTwister: null } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "chaosTwisterSliderPosition") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const position = (msg as { position?: unknown }).position as
      | number
      | undefined;
    if (position == null || !Number.isFinite(position)) return;
    set((s) => {
      if (!s.pendingChaosTwister || (id && s.pendingChaosTwister.id !== id))
        return s as GameState;
      return {
        pendingChaosTwister: {
          ...s.pendingChaosTwister,
          sliderPosition: position,
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  // Log unhandled Chaos Twister messages for debugging
  if (typeof t === "string" && t.startsWith("chaosTwister")) {
    console.log(`[ChaosTwister] Unhandled message type: ${t}`, msg);
  }
  // --- Browse spell message handlers ---
  if (t === "browseBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const revealedCount = (msg as { revealedCount?: unknown }).revealedCount as
      | number
      | undefined;
    if (!id || !spellAny || !casterSeat) return;
    const rec = spellAny as Record<string, unknown>;
    // Opponent sees Browse begin but doesn't see the actual cards
    set({
      pendingBrowse: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "viewing",
        revealedCards: [], // Opponent doesn't see the cards
        selectedCardIndex: null,
        bottomOrder: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${casterSeat.toUpperCase()}] is browsing ${
          revealedCount ?? "?"
        } spells...`
      );
    } catch {}
    return;
  }
  if (t === "browseSelectCard") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const cardIndex = (msg as { cardIndex?: unknown }).cardIndex as
      | number
      | undefined;
    if (!id || cardIndex == null) return;
    set((s) => {
      if (!s.pendingBrowse || s.pendingBrowse.id !== id) return s as GameState;
      return {
        pendingBrowse: {
          ...s.pendingBrowse,
          selectedCardIndex: cardIndex,
          phase: "ordering",
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "browseSetOrder") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const order = (msg as { order?: unknown }).order as number[] | undefined;
    if (!id || !Array.isArray(order)) return;
    set((s) => {
      if (!s.pendingBrowse || s.pendingBrowse.id !== id) return s as GameState;
      return {
        pendingBrowse: {
          ...s.pendingBrowse,
          bottomOrder: order,
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "browseResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const pending = get().pendingBrowse;
    if (!pending || (id && pending.id !== id)) return;

    // Move spell to graveyard (opponent side)
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard"
      );
    } catch {}

    set({ pendingBrowse: null } as Partial<GameState> as GameState);
    try {
      get().log(`[${pending.casterSeat.toUpperCase()}] Browse resolved`);
    } catch {}
    return;
  }
  if (t === "browseCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingBrowse || (id && s.pendingBrowse.id !== id))
        return s as GameState;
      return { pendingBrowse: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Browse cancelled");
    } catch {}
    return;
  }
  // Log unhandled Browse messages for debugging
  if (typeof t === "string" && t.startsWith("browse")) {
    console.log(`[Browse] Unhandled message type: ${t}`, msg);
  }

  // --- Common Sense spell message handlers ---
  if (t === "commonSenseBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const eligibleCount = (msg as { eligibleCount?: unknown }).eligibleCount as
      | number
      | undefined;
    if (!id || !spellAny || !casterSeat) return;
    const rec = spellAny as Record<string, unknown>;
    // Opponent sees Common Sense begin but doesn't see the actual cards
    set({
      pendingCommonSense: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "selecting",
        eligibleCards: [], // Opponent doesn't see the cards
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${casterSeat.toUpperCase()}] is searching for Ordinary cards (${
          eligibleCount ?? "?"
        } found)...`
      );
    } catch {}
    return;
  }
  if (t === "commonSenseSelectCard") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const cardIndex = (msg as { cardIndex?: unknown }).cardIndex as
      | number
      | undefined;
    if (!id || cardIndex == null) return;
    set((s) => {
      if (!s.pendingCommonSense || s.pendingCommonSense.id !== id)
        return s as GameState;
      return {
        pendingCommonSense: {
          ...s.pendingCommonSense,
          selectedCardIndex: cardIndex,
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "commonSenseResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const selectedCardName = (msg as { selectedCardName?: unknown })
      .selectedCardName as string | undefined;
    const pending = get().pendingCommonSense;
    if (!pending || (id && pending.id !== id)) return;

    // Move spell to graveyard (opponent side)
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard"
      );
    } catch {}

    set({ pendingCommonSense: null } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${pending.casterSeat.toUpperCase()}] Common Sense resolved: found ${
          selectedCardName ?? "a card"
        }`
      );
    } catch {}
    return;
  }
  if (t === "commonSenseCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingCommonSense || (id && s.pendingCommonSense.id !== id))
        return s as GameState;
      return { pendingCommonSense: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Common Sense cancelled");
    } catch {}
    return;
  }

  // --- Pith Imp message handlers ---
  if (t === "pithImpSteal") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const minionAny = (msg as { minion?: unknown }).minion as unknown;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const stolenCardName = (msg as { stolenCardName?: unknown })
      .stolenCardName as string | undefined;
    const stolenCardAny = (msg as { stolenCard?: unknown })
      .stolenCard as unknown;
    const stolenCardHandIndex = (msg as { stolenCardHandIndex?: unknown })
      .stolenCardHandIndex as number | undefined;
    const victimSeat = (msg as { victimSeat?: unknown }).victimSeat as
      | PlayerKey
      | undefined;

    if (!id || !minionAny || !ownerSeat || !victimSeat) {
      return;
    }

    // Skip if we're the owner - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === ownerSeat) {
      return;
    }

    // Skip if we've already processed this steal (deduplication)
    const existingHands = get().pithImpHands;
    if (existingHands.some((h) => h.id === id)) {
      return;
    }

    const minionRec = minionAny as Record<string, unknown>;
    const stolenCard = stolenCardAny as CardRef | undefined;

    // Remove the stolen card from victim's hand
    const zones = get().zones;
    const victimHand = [...(zones[victimSeat]?.hand || [])];

    if (
      stolenCard &&
      typeof stolenCardHandIndex === "number" &&
      stolenCardHandIndex >= 0 &&
      stolenCardHandIndex < victimHand.length
    ) {
      victimHand.splice(stolenCardHandIndex, 1);
    } else if (stolenCard) {
      // Fallback to findIndex
      const handIndex = victimHand.findIndex(
        (c) => c.cardId === stolenCard.cardId && c.name === stolenCard.name
      );
      if (handIndex !== -1) {
        victimHand.splice(handIndex, 1);
      }
    }

    const zonesNext = {
      ...zones,
      [victimSeat]: {
        ...zones[victimSeat],
        hand: victimHand,
      },
    };

    // Add to pithImpHands tracking (victim doesn't need the full hand, just tracking)
    const newPithImpHand = {
      id,
      minion: {
        at: minionRec.at as CellKey,
        index: Number(minionRec.index),
        instanceId: (minionRec.instanceId as string | null) ?? null,
        owner: Number(minionRec.owner) as 1 | 2,
        card: minionRec.card as CardRef,
      },
      ownerSeat,
      victimSeat,
      hand: stolenCard ? [stolenCard] : [],
      createdAt: Date.now(),
    };

    // Create visual attachment for display (both players see it)
    const permanents = get().permanents;
    const minionAt = minionRec.at as CellKey;
    const minionCell = permanents[minionAt] || [];
    const minionIndex = minionCell.findIndex(
      (p) => p.instanceId === minionRec.instanceId
    );

    let permanentsNext = permanents;
    if (minionIndex !== -1 && stolenCard) {
      // Add stolen card as visual attachment (for display only)
      const stolenVisual = {
        card: { ...stolenCard, pithImpStolen: true } as CardRef,
        owner: Number(minionRec.owner) as 1 | 2,
        instanceId: `pithimp_visual_${id}`,
        tapped: false,
        attachedTo: { at: minionAt, index: minionIndex },
      };
      const cellWithVisual = [...minionCell, stolenVisual];
      permanentsNext = {
        ...permanents,
        [minionAt]: cellWithVisual,
      };
    }

    set((s) => ({
      pithImpHands: [...s.pithImpHands, newPithImpHand],
      zones: zonesNext,
      permanents: permanentsNext,
    })) as unknown as void;

    try {
      get().log(
        `[${ownerSeat.toUpperCase()}] Pith Imp steals ${
          stolenCardName ?? "a spell"
        } from ${victimSeat.toUpperCase()}'s hand!`
      );
    } catch {}
    return;
  }
  if (t === "pithImpReturn") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const minionAt = (msg as { minionAt?: unknown }).minionAt as
      | CellKey
      | undefined;
    const minionInstanceId = (msg as { minionInstanceId?: unknown })
      .minionInstanceId as string | null | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const victimSeat = (msg as { victimSeat?: unknown }).victimSeat as
      | PlayerKey
      | undefined;
    // Full card data from owner
    const cardsToReturn = (msg as { cardsToReturn?: unknown }).cardsToReturn as
      | CardRef[]
      | undefined;

    if (!minionAt || !victimSeat) return;

    // Skip if we're the owner - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey && actorKey === ownerSeat) {
      return;
    }

    // Deduplication: Check if we already processed this return
    if (id) {
      const processed = get().processedPithImpReturns || new Set<string>();
      if (processed.has(id)) {
        return;
      }
    }

    // Use cardsToReturn from message (owner is source of truth)
    if (!cardsToReturn || cardsToReturn.length === 0) {
      // Clean up any local tracking - single atomic update
      set((s) => {
        const processed = s.processedPithImpReturns || new Set<string>();
        return {
          processedPithImpReturns: id ? new Set([...processed, id]) : processed,
          pithImpHands: s.pithImpHands.filter(
            (p) =>
              p.minion.at !== minionAt &&
              (!minionInstanceId || p.minion.instanceId !== minionInstanceId)
          ),
        };
      }) as unknown as void;
      return;
    }

    // Remove visual attachments (stolen cards with pithImpStolen flag)
    const permanents = get().permanents;
    const cell = permanents[minionAt] || [];
    const cellWithoutStolenVisuals = cell.filter((p) => {
      const isPithImpStolen = (p.card as { pithImpStolen?: boolean })
        ?.pithImpStolen;
      return !isPithImpStolen || p.attachedTo?.at !== minionAt;
    });
    const permanentsNext =
      cellWithoutStolenVisuals.length !== cell.length
        ? { ...permanents, [minionAt]: cellWithoutStolenVisuals }
        : permanents;

    // CRITICAL: Victim must add cards to their own hand since owner's zones patch
    // gets filtered out by trySendPatch sanitization (actors can only send their own seat data)
    const zones = get().zones;
    const victimHand = [...(zones[victimSeat]?.hand || [])];
    for (const card of cardsToReturn) {
      victimHand.push(card);
    }
    const zonesNext = {
      ...zones,
      [victimSeat]: {
        ...zones[victimSeat],
        hand: victimHand,
      },
    } as GameState["zones"];

    // CRITICAL: Single atomic update - add cards to hand, mark as processed, remove from tracking
    set((s) => {
      const processed = s.processedPithImpReturns || new Set<string>();
      return {
        processedPithImpReturns: id ? new Set([...processed, id]) : processed,
        pithImpHands: s.pithImpHands.filter(
          (p) =>
            p.minion.at !== minionAt &&
            (!minionInstanceId || p.minion.instanceId !== minionInstanceId)
        ),
        permanents: permanentsNext,
        zones: zonesNext,
      };
    }) as unknown as void;

    // Log return messages AFTER state update (avoid duplicate logs)
    for (const card of cardsToReturn) {
      try {
        get().log(
          `${
            card.name
          } returns to ${victimSeat.toUpperCase()}'s hand (Pith Imp left the realm)`
        );
      } catch {}
    }

    return;
  }

  // --- Morgana le Fay message handlers ---
  if (t === "morganaGenesis") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const minionAny = (msg as { minion?: unknown }).minion as unknown;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const drawnCount = (msg as { drawnCount?: unknown }).drawnCount as
      | number
      | undefined;
    const drawnCardsAny = (msg as { drawnCards?: unknown })
      .drawnCards as unknown;
    if (!id || !minionAny || !ownerSeat) return;

    // Skip if we're the owner - we already handled it locally via triggerMorganaGenesis
    const actorKey = get().actorKey;
    if (actorKey === ownerSeat) {
      console.log(
        "[Morgana] morganaGenesis: Skipping - we are the owner, already handled locally"
      );
      return;
    }

    const minionRec = minionAny as Record<string, unknown>;
    const drawnCards = Array.isArray(drawnCardsAny)
      ? (drawnCardsAny as CardRef[])
      : [];

    // Create Morgana's private hand entry
    const newMorganaHand = {
      id,
      minion: {
        at: minionRec.at as CellKey,
        index: Number(minionRec.index),
        instanceId: (minionRec.instanceId as string | null) ?? null,
        owner: Number(minionRec.owner) as 1 | 2,
        card: minionRec.card as CardRef,
      },
      ownerSeat,
      hand: drawnCards,
      createdAt: Date.now(),
    };

    // Remove drawn cards from spellbook (opponent side sync)
    const drawCount = drawnCards.length;
    set((s) => {
      const currentSpellbook = s.zones[ownerSeat]?.spellbook || [];
      const updatedSpellbook = currentSpellbook.slice(drawCount); // Remove from top
      return {
        morganaHands: [...s.morganaHands, newMorganaHand],
        zones: {
          ...s.zones,
          [ownerSeat]: {
            ...s.zones[ownerSeat],
            spellbook: updatedSpellbook,
          },
        },
      };
    }) as unknown as void;

    try {
      get().log(
        `[${ownerSeat.toUpperCase()}] Morgana le Fay draws her own hand of ${
          drawnCount ?? drawnCards.length
        } spell${(drawnCount ?? drawnCards.length) !== 1 ? "s" : ""}`
      );
    } catch {}
    return;
  }
  if (t === "morganaCast") {
    const morganaId = (msg as { morganaId?: unknown }).morganaId as
      | string
      | undefined;
    const cardIndex = (msg as { cardIndex?: unknown }).cardIndex as
      | number
      | undefined;
    const cardName = (msg as { cardName?: unknown }).cardName as
      | string
      | undefined;
    const targetTileAny = (msg as { targetTile?: unknown })
      .targetTile as unknown;
    if (!morganaId || cardIndex == null) return;

    // Update Morgana's hand (remove the cast card)
    set((s) => ({
      morganaHands: s.morganaHands.map((m) => {
        if (m.id !== morganaId) return m;
        const newHand = [...m.hand];
        if (cardIndex >= 0 && cardIndex < newHand.length) {
          newHand.splice(cardIndex, 1);
        }
        return { ...m, hand: newHand };
      }),
    })) as unknown as void;

    const targetTile = targetTileAny as { x: number; y: number } | undefined;
    try {
      get().log(
        `Morgana le Fay casts ${cardName ?? "a spell"}${
          targetTile ? ` at tile ${targetTile.x},${targetTile.y}` : ""
        }`
      );
    } catch {}
    return;
  }
  if (t === "morganaRemove") {
    const minionAt = (msg as { minionAt?: unknown }).minionAt as
      | CellKey
      | undefined;
    const minionInstanceId = (msg as { minionInstanceId?: unknown })
      .minionInstanceId as string | null | undefined;
    const discardedCount = (msg as { discardedCount?: unknown })
      .discardedCount as number | undefined;

    if (!minionAt) return;

    // Remove from morganaHands tracking
    set((s) => ({
      morganaHands: s.morganaHands.filter(
        (m) =>
          m.minion.at !== minionAt &&
          (!minionInstanceId || m.minion.instanceId !== minionInstanceId)
      ),
    })) as unknown as void;

    if (discardedCount && discardedCount > 0) {
      try {
        get().log(
          `Morgana le Fay's remaining ${discardedCount} spell${
            discardedCount !== 1 ? "s" : ""
          } go to graveyard`
        );
      } catch {}
    }
    return;
  }

  // --- Omphalos message handlers ---
  if (t === "omphalosRegister") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const artifactAny = (msg as { artifact?: unknown }).artifact as unknown;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    if (!id || !artifactAny || !ownerSeat) return;

    // Skip if we're the owner - we already handled it locally via registerOmphalos
    const actorKey = get().actorKey;
    if (actorKey === ownerSeat) {
      console.log(
        "[Omphalos] omphalosRegister: Skipping - we are the owner, already handled locally"
      );
      return;
    }

    const artifactRec = artifactAny as Record<string, unknown>;

    // Create Omphalos's private hand entry
    const newOmphalosHand = {
      id,
      artifact: {
        at: artifactRec.at as CellKey,
        index: Number(artifactRec.index),
        instanceId: (artifactRec.instanceId as string | null) ?? null,
        owner: Number(artifactRec.owner) as 1 | 2,
        card: artifactRec.card as CardRef,
      },
      ownerSeat,
      hand: [] as CardRef[],
      createdAt: Date.now(),
    };

    set((s) => ({
      omphalosHands: [...s.omphalosHands, newOmphalosHand],
    })) as unknown as void;

    try {
      get().log(
        `[${ownerSeat.toUpperCase()}] ${
          (artifactRec.card as CardRef)?.name || "Omphalos"
        } enters the realm`
      );
    } catch {}
    return;
  }
  if (t === "omphalosDrawn") {
    const omphalosId = (msg as { omphalosId?: unknown }).omphalosId as
      | string
      | undefined;
    const drawnCardAny = (msg as { drawnCard?: unknown }).drawnCard as unknown;
    const newHandSize = (msg as { newHandSize?: unknown }).newHandSize as
      | number
      | undefined;
    if (!omphalosId) return;

    const drawnCard = drawnCardAny as CardRef | undefined;

    // Find the Omphalos entry to get owner seat
    const omphalosEntry = get().omphalosHands.find((o) => o.id === omphalosId);
    const ownerSeat = omphalosEntry?.ownerSeat;

    // Update Omphalos's hand and remove card from spellbook (opponent side sync)
    set((s) => {
      const updatedOmphalosHands = s.omphalosHands.map((o) => {
        if (o.id !== omphalosId) return o;
        const newHand = drawnCard ? [...o.hand, drawnCard] : o.hand;
        return { ...o, hand: newHand };
      });

      // Also remove 1 card from top of owner's spellbook
      if (ownerSeat && drawnCard) {
        const currentSpellbook = s.zones[ownerSeat]?.spellbook || [];
        const updatedSpellbook = currentSpellbook.slice(1); // Remove 1 from top
        return {
          omphalosHands: updatedOmphalosHands,
          zones: {
            ...s.zones,
            [ownerSeat]: {
              ...s.zones[ownerSeat],
              spellbook: updatedSpellbook,
            },
          },
        };
      }

      return { omphalosHands: updatedOmphalosHands };
    }) as unknown as void;

    // Find the Omphalos entry to log
    const entry = get().omphalosHands.find((o) => o.id === omphalosId);
    if (entry) {
      try {
        get().log(
          `[${entry.ownerSeat.toUpperCase()}] ${
            entry.artifact.card.name
          } draws a spell (now has ${newHandSize ?? entry.hand.length})`
        );
      } catch {}
    }
    return;
  }
  if (t === "omphalosCast") {
    const omphalosId = (msg as { omphalosId?: unknown }).omphalosId as
      | string
      | undefined;
    const cardIndex = (msg as { cardIndex?: unknown }).cardIndex as
      | number
      | undefined;
    const cardName = (msg as { cardName?: unknown }).cardName as
      | string
      | undefined;
    const targetTileAny = (msg as { targetTile?: unknown })
      .targetTile as unknown;
    if (!omphalosId || cardIndex == null) return;

    // Update Omphalos's hand (remove the cast card)
    set((s) => ({
      omphalosHands: s.omphalosHands.map((o) => {
        if (o.id !== omphalosId) return o;
        const newHand = [...o.hand];
        if (cardIndex >= 0 && cardIndex < newHand.length) {
          newHand.splice(cardIndex, 1);
        }
        return { ...o, hand: newHand };
      }),
    })) as unknown as void;

    const entry = get().omphalosHands.find((o) => o.id === omphalosId);
    const targetTile = targetTileAny as { x: number; y: number } | undefined;
    try {
      get().log(
        `${entry?.artifact.card.name || "Omphalos"} casts ${
          cardName ?? "a spell"
        }${targetTile ? ` at tile ${targetTile.x},${targetTile.y}` : ""}`
      );
    } catch {}
    return;
  }
  if (t === "omphalosRemove") {
    const artifactAt = (msg as { artifactAt?: unknown }).artifactAt as
      | CellKey
      | undefined;
    const artifactInstanceId = (msg as { artifactInstanceId?: unknown })
      .artifactInstanceId as string | null | undefined;
    const discardedCount = (msg as { discardedCount?: unknown })
      .discardedCount as number | undefined;

    if (!artifactAt) return;

    // Find the entry before removing for logging
    const entry = get().omphalosHands.find(
      (o) =>
        o.artifact.at === artifactAt ||
        (artifactInstanceId && o.artifact.instanceId === artifactInstanceId)
    );

    // Remove from omphalosHands tracking
    set((s) => ({
      omphalosHands: s.omphalosHands.filter(
        (o) =>
          o.artifact.at !== artifactAt &&
          (!artifactInstanceId || o.artifact.instanceId !== artifactInstanceId)
      ),
    })) as unknown as void;

    if (discardedCount && discardedCount > 0 && entry) {
      try {
        get().log(
          `${entry.artifact.card.name}'s remaining ${discardedCount} spell${
            discardedCount !== 1 ? "s" : ""
          } go to graveyard`
        );
      } catch {}
    }
    return;
  }

  // --- Earthquake spell message handlers ---
  if (t === "earthquakeBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    if (!id || !spellAny || !casterSeat) return;
    const rec = spellAny as Record<string, unknown>;
    // Opponent sees Earthquake begin
    set({
      pendingEarthquake: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "selectingArea",
        areaCorner: null,
        swaps: [],
        affectedCells: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${casterSeat.toUpperCase()}] casts Earthquake - selecting a 2×2 area...`
      );
    } catch {}
    return;
  }
  if (t === "earthquakeSelectArea") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const corner = (msg as { corner?: unknown }).corner as
      | { x: number; y: number }
      | undefined;
    const affectedCells = (msg as { affectedCells?: unknown }).affectedCells as
      | CellKey[]
      | undefined;
    if (!id || !corner) return;
    set((s) => {
      if (!s.pendingEarthquake || s.pendingEarthquake.id !== id)
        return s as GameState;
      return {
        pendingEarthquake: {
          ...s.pendingEarthquake,
          areaCorner: corner,
          affectedCells: affectedCells || [],
          phase: "rearranging",
        },
      } as Partial<GameState> as GameState;
    });
    try {
      const board = get().board;
      const cells = affectedCells || [];
      const cellNos = cells
        .map((cell) => {
          const [cx, cy] = cell.split(",").map(Number);
          return `#${getCellNumber(cx, cy, board.size.w)}`;
        })
        .join(", ");
      get().log(`Earthquake area selected: ${cellNos}`);
    } catch {}
    return;
  }
  if (t === "earthquakeSwap") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const from = (msg as { from?: unknown }).from as
      | { x: number; y: number }
      | undefined;
    const to = (msg as { to?: unknown }).to as
      | { x: number; y: number }
      | undefined;
    if (!id || !from || !to) return;

    // Skip if we're the caster - we already handled it locally
    const pending = get().pendingEarthquake;
    const actorKey = get().actorKey;
    if (pending && actorKey === pending.casterSeat) {
      return;
    }

    // Perform the swap on opponent's side
    try {
      get().switchSitePosition(from.x, from.y, to.x, to.y);
    } catch {}

    // Update pending state with the swap
    set((s) => {
      if (!s.pendingEarthquake || s.pendingEarthquake.id !== id)
        return s as GameState;
      return {
        pendingEarthquake: {
          ...s.pendingEarthquake,
          swaps: [...s.pendingEarthquake.swaps, { from, to }],
        },
      } as Partial<GameState> as GameState;
    });

    try {
      const board = get().board;
      const fromNo = getCellNumber(from.x, from.y, board.size.w);
      const toNo = getCellNumber(to.x, to.y, board.size.w);
      get().log(`Earthquake: swapped sites #${fromNo} <-> #${toNo}`);
    } catch {}
    return;
  }
  if (t === "earthquakeResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const burrowedItems = (msg as { burrowedItems?: unknown }).burrowedItems as
      | Array<{ at: CellKey; index: number; name: string }>
      | undefined;
    const pending = get().pendingEarthquake;
    if (!pending || (id && pending.id !== id)) return;

    // Skip if we're the caster - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === pending.casterSeat) {
      set({ pendingEarthquake: null } as Partial<GameState> as GameState);
      return;
    }

    // Burrow the items on opponent's side
    const permanents = get().permanents;
    for (const cellKey of pending.affectedCells) {
      const cellPermanents = permanents[cellKey] || [];
      for (let i = 0; i < cellPermanents.length; i++) {
        const perm = cellPermanents[i];
        if (!perm || perm.attachedTo) continue;
        const type = (perm.card?.type || "").toLowerCase();
        if (type.includes("minion") || type.includes("artifact")) {
          if (!perm.tapped) {
            try {
              get().setTapPermanent(cellKey, i, true);
            } catch {}
          }
        }
      }
    }

    // Move spell to graveyard (opponent side)
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard"
      );
    } catch {}

    set({ pendingEarthquake: null } as Partial<GameState> as GameState);
    try {
      const burrowedList =
        burrowedItems && burrowedItems.length > 0
          ? burrowedItems.map((b) => b.name).join(", ")
          : "no units";
      get().log(
        `[${pending.casterSeat.toUpperCase()}] Earthquake resolved. Burrowed: ${burrowedList}`
      );
    } catch {}
    return;
  }
  if (t === "earthquakeCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingEarthquake || (id && s.pendingEarthquake.id !== id))
        return s as GameState;
      return { pendingEarthquake: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Earthquake cancelled");
    } catch {}
    return;
  }
}
