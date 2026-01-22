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
  ServerPatchT,
  Zones,
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
  get: StoreGet,
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
  if (t === "revealCards") {
    // Opponent revealed cards from a pile - show them in peek dialog
    const payload = msg as {
      title?: string;
      cards?: CardRef[];
      source?: { seat?: PlayerKey; pile?: string; from?: string };
    };
    if (Array.isArray(payload.cards)) {
      get().openPeekDialog(
        typeof payload.title === "string" ? payload.title : "Revealed",
        payload.cards,
        payload.source as {
          seat: PlayerKey;
          pile: "spellbook" | "atlas" | "hand";
          from: "top" | "bottom";
        },
      );
    }
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
              Math.max(0, Math.floor(amt)),
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
            }),
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
          Math.max(0, Math.floor(amt)),
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
        killsAny.length,
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
              `[combatAutoApply] Kill owner=${k.owner}, mySeat=${mySeat}, matches=${matches}`,
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
                "without mySeat",
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
              (p) => p.instanceId === kill.instanceId,
            );
            if (foundIdx >= 0) {
              currentIndex = foundIdx;
              console.log(
                "[combatAutoApply] Found by instanceId at index:",
                currentIndex,
              );
            } else {
              console.warn(
                "[combatAutoApply] Permanent not found by instanceId, using original index:",
                kill,
              );
            }
          }
          console.log(
            "[combatAutoApply] Applying kill to graveyard:",
            kill.at,
            currentIndex,
          );
          get().movePermanentToZone(
            kill.at as CellKey,
            currentIndex,
            "graveyard",
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
          x,
        ): x is {
          at: CellKey;
          index: number;
          owner: 1 | 2;
          instanceId: string | null;
        } => Boolean(x),
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
        }`,
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
        index: number,
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
            p.attachedTo.index === index,
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
          power,
        );
      }

      // Note: Don't call movePermanentToZone here - the caster's patch handles it.
      // Calling it here causes race conditions since messages arrive before patches.
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
        } spells...`,
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
      // Build default bottom order (all cards except selected, in original order)
      const bottomOrder = s.pendingBrowse.revealedCards
        .map((_, i) => i)
        .filter((i) => i !== cardIndex);
      return {
        pendingBrowse: {
          ...s.pendingBrowse,
          selectedCardIndex: cardIndex,
          bottomOrder,
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

    // Note: Don't call movePermanentToZone here - the caster's patch handles it.
    // Calling it here causes race conditions since messages arrive before patches.

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
        } found)...`,
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

    // Note: Don't call movePermanentToZone here - the caster's patch handles it.
    // Calling it here causes race conditions since messages arrive before patches.

    set({ pendingCommonSense: null } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${pending.casterSeat.toUpperCase()}] Common Sense resolved: found ${
          selectedCardName ?? "a card"
        }`,
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

  // --- Call to War spell message handlers ---
  if (t === "callToWarBegin") {
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
    // Opponent sees Call to War begin but doesn't see the actual cards
    set({
      pendingCallToWar: {
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
        `[${casterSeat.toUpperCase()}] is searching for Exceptional Mortals (${
          eligibleCount ?? "?"
        } found)...`,
      );
    } catch {}
    return;
  }
  if (t === "callToWarSelectCard") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const cardIndex = (msg as { cardIndex?: unknown }).cardIndex as
      | number
      | undefined;
    if (!id || cardIndex == null) return;
    set((s) => {
      if (!s.pendingCallToWar || s.pendingCallToWar.id !== id)
        return s as GameState;
      return {
        pendingCallToWar: {
          ...s.pendingCallToWar,
          selectedCardIndex: cardIndex,
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "callToWarResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const selectedCardName = (msg as { selectedCardName?: unknown })
      .selectedCardName as string | undefined;
    const pending = get().pendingCallToWar;
    if (!pending || (id && pending.id !== id)) return;

    // Note: Don't call movePermanentToZone here - the caster's patch handles it.
    // Calling it here causes race conditions since messages arrive before patches.

    set({ pendingCallToWar: null } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${pending.casterSeat.toUpperCase()}] Call to War resolved: found ${
          selectedCardName ?? "a warrior"
        }`,
      );
    } catch {}
    return;
  }
  if (t === "callToWarCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingCallToWar || (id && s.pendingCallToWar.id !== id))
        return s as GameState;
      return { pendingCallToWar: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Call to War cancelled");
    } catch {}
    return;
  }

  // --- Searing Truth spell message handlers ---
  if (t === "searingTruthBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    if (!id || !spellAny || !casterSeat) return;
    const rec = spellAny as Record<string, unknown>;
    set({
      pendingSearingTruth: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "selectingTarget",
        targetSeat: null,
        revealedCards: [],
        damageAmount: 0,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(`[${casterSeat.toUpperCase()}] casts Searing Truth...`);
    } catch {}
    return;
  }
  if (t === "searingTruthTarget") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const targetSeat = (msg as { targetSeat?: unknown }).targetSeat as
      | PlayerKey
      | undefined;
    const revealedCardsAny = (msg as { revealedCards?: unknown })
      .revealedCards as unknown;
    const damageAmount = (msg as { damageAmount?: unknown }).damageAmount as
      | number
      | undefined;
    if (!id || !targetSeat) return;
    const revealedCards = Array.isArray(revealedCardsAny)
      ? (revealedCardsAny as CardRef[])
      : [];

    // IMPORTANT: The caster's trySendPatch only sends their own seat's zones,
    // so when targeting the opponent, we need to update the target's zones here.
    // Draw the revealed cards from spellbook to hand for the target player.
    console.log("[SearingTruth] Handler received:", {
      id,
      targetSeat,
      revealedCardIds: revealedCards.map((c) => c.cardId),
      actorKey: get().actorKey,
    });
    set((s) => {
      // Initialize pendingSearingTruth if not exists (message might arrive before begin)
      const currentPending = s.pendingSearingTruth;
      if (currentPending && currentPending.id !== id) return s as GameState;

      // Only update zones if we're the target (the caster already updated locally)
      const actorKey = s.actorKey;
      const isTarget = actorKey === targetSeat;
      console.log(
        "[SearingTruth] set() isTarget:",
        isTarget,
        "actorKey:",
        actorKey,
        "targetSeat:",
        targetSeat,
      );

      let zonesUpdate = {};
      if (isTarget && revealedCards.length > 0) {
        const zones = s.zones;
        const spellbook = [...(zones[targetSeat]?.spellbook || [])];
        const hand = [...(zones[targetSeat]?.hand || [])];

        // Find and move the actual cards from spellbook to hand
        // Use cardIds from message to identify which cards to move
        // Track counts instead of using Set to handle duplicate cardIds
        const drawnCardCounts = new Map<number, number>();
        for (const c of revealedCards) {
          drawnCardCounts.set(
            c.cardId,
            (drawnCardCounts.get(c.cardId) || 0) + 1,
          );
        }
        const movedCards: CardRef[] = [];
        const updatedSpellbook = spellbook.filter((card) => {
          const remaining = drawnCardCounts.get(card.cardId) || 0;
          if (remaining > 0 && movedCards.length < revealedCards.length) {
            movedCards.push(card); // Keep full card data from local spellbook
            drawnCardCounts.set(card.cardId, remaining - 1); // Decrement count
            return false;
          }
          return true;
        });

        // Add the actual cards (with full data) to hand
        for (const card of movedCards) {
          hand.push(card);
        }

        console.log(
          "[SearingTruth] Updating zones - movedCards:",
          movedCards.length,
          "updatedSpellbook:",
          updatedSpellbook.length,
          "hand:",
          hand.length,
        );

        zonesUpdate = {
          zones: {
            ...zones,
            [targetSeat]: {
              ...zones[targetSeat],
              spellbook: updatedSpellbook,
              hand,
            },
          },
        };
      }

      // Use movedCards for revealedCards if we're the target (full card data)
      // Otherwise use the cards from the message
      return {
        ...zonesUpdate,
        pendingSearingTruth: {
          ...(currentPending || {
            id,
            spell: {
              at: "0,0" as CellKey,
              index: 0,
              instanceId: null,
              owner: 1,
              card: {} as CardRef,
            },
            casterSeat: targetSeat === "p1" ? "p2" : "p1",
            createdAt: Date.now(),
          }),
          phase: "revealing",
          targetSeat,
          revealedCards,
          damageAmount: damageAmount ?? 0,
        },
      } as Partial<GameState> as GameState;
    });
    const cardNames = revealedCards.map((c) => c.name || "Unknown").join(", ");
    try {
      get().log(
        `[${targetSeat.toUpperCase()}] reveals ${cardNames} - ${
          damageAmount ?? 0
        } damage incoming`,
      );
    } catch {}
    return;
  }
  if (t === "searingTruthResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const damageAmount = (msg as { damageAmount?: unknown }).damageAmount as
      | number
      | undefined;
    const pending = get().pendingSearingTruth;
    if (!pending || (id && pending.id !== id)) return;

    // Note: Don't call movePermanentToZone here - the caster's patch handles it.
    // Calling it here causes race conditions since messages arrive before patches.

    // IMPORTANT: Delay clearing pendingSearingTruth to allow the filter in applyServerPatch
    // to protect the zones from being overwritten by stale server patches.
    // The filter uses pendingSearingTruth.revealedCards to know which cards to keep in hand.
    setTimeout(() => {
      const currentPending = get().pendingSearingTruth;
      if (currentPending && currentPending.id === id) {
        set({ pendingSearingTruth: null } as Partial<GameState> as GameState);
      }
    }, 3000); // Keep protection for 3 seconds
    try {
      get().log(
        `Searing Truth resolved: ${pending.targetSeat?.toUpperCase()} takes ${
          damageAmount ?? 0
        } damage`,
      );
    } catch {}
    return;
  }
  if (t === "searingTruthCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingSearingTruth || (id && s.pendingSearingTruth.id !== id))
        return s as GameState;
      return { pendingSearingTruth: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Searing Truth cancelled");
    } catch {}
    return;
  }

  // --- Accusation spell message handlers ---
  if (t === "accusationBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const victimSeat = (msg as { victimSeat?: unknown }).victimSeat as
      | PlayerKey
      | undefined;
    const handSize = (msg as { handSize?: unknown }).handSize as
      | number
      | undefined;
    const casterHasChoice = (msg as { casterHasChoice?: unknown })
      .casterHasChoice as boolean | undefined;
    const evilCardIndices = (msg as { evilCardIndices?: unknown })
      .evilCardIndices as number[] | undefined;
    if (!id || !spellAny || !casterSeat || !victimSeat) return;

    // Skip if we already have this accusation (caster receiving their own broadcast)
    const existing = get().pendingAccusation;
    if (existing?.id === id) return;

    const rec = spellAny as Record<string, unknown>;

    // Get victim's hand (they can see their own cards)
    const zones = get().zones;
    const actorKey = get().actorKey;
    const isVictim = actorKey === victimSeat;
    const revealedHand = isVictim ? zones[victimSeat]?.hand || [] : [];

    set({
      pendingAccusation: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "revealing",
        victimSeat,
        revealedHand,
        casterHasChoice: casterHasChoice ?? false,
        evilCardIndices: evilCardIndices ?? [],
        selectedCardIndex: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${casterSeat.toUpperCase()}] casts Accusation - ${victimSeat.toUpperCase()}'s hand is revealed (${
          handSize ?? "?"
        } cards)`,
      );
    } catch {}

    // Auto-transition to selecting phase
    setTimeout(() => {
      const current = get().pendingAccusation;
      if (current?.id === id && current.phase === "revealing") {
        set({
          pendingAccusation: {
            ...current,
            phase: "selecting",
          },
        } as Partial<GameState> as GameState);
      }
    }, 1500);
    return;
  }
  if (t === "accusationSelectCard") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const cardIndex = (msg as { cardIndex?: unknown }).cardIndex as
      | number
      | undefined;
    if (!id || cardIndex == null) return;
    set((s) => {
      if (!s.pendingAccusation || s.pendingAccusation.id !== id)
        return s as GameState;
      return {
        pendingAccusation: {
          ...s.pendingAccusation,
          selectedCardIndex: cardIndex,
        },
      } as Partial<GameState> as GameState;
    });
    return;
  }
  if (t === "accusationResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const victimSeat = (msg as { victimSeat?: unknown }).victimSeat as
      | PlayerKey
      | undefined;
    const selectedCardIndex = (msg as { selectedCardIndex?: unknown })
      .selectedCardIndex as number | undefined;
    const selectedCard = (msg as { selectedCard?: unknown }).selectedCard as
      | CardRef
      | undefined;

    if (!id || !casterSeat || !victimSeat) return;

    // Skip if we're the caster - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === casterSeat) {
      set({ pendingAccusation: null } as Partial<GameState> as GameState);
      return;
    }

    // We are the victim - update our own zones
    if (
      actorKey === victimSeat &&
      selectedCard &&
      typeof selectedCardIndex === "number"
    ) {
      const zones = get().zones;
      const hand = [...(zones[victimSeat]?.hand || [])];
      const banished = [...(zones[victimSeat]?.banished || [])];

      // Find and remove the card from hand
      const handIndex = hand.findIndex(
        (c) =>
          c.cardId === selectedCard.cardId &&
          c.slug === selectedCard.slug &&
          c.name === selectedCard.name,
      );

      if (handIndex !== -1) {
        hand.splice(handIndex, 1);
      }

      // Add to banished
      banished.push(selectedCard);

      const zonesNext = {
        ...zones,
        [victimSeat]: {
          ...zones[victimSeat],
          hand,
          banished,
        },
      };

      set({
        zones: zonesNext,
        pendingAccusation: null,
      } as Partial<GameState> as GameState);

      // CRITICAL: Persist zone changes to server - we're updating OUR OWN seat so this is allowed
      try {
        get().trySendPatch({
          zones: { [victimSeat]: zonesNext[victimSeat] } as Record<
            PlayerKey,
            Zones
          >,
        });
      } catch {}

      try {
        get().log(
          `Accusation resolved: ${
            selectedCard.name ?? "a card"
          } banished from ${victimSeat.toUpperCase()}'s hand`,
        );
      } catch {}
    } else {
      // Spectator or other case - just clear pending state
      set({ pendingAccusation: null } as Partial<GameState> as GameState);
      const pending = get().pendingAccusation;
      try {
        get().log(
          `Accusation resolved: a card banished from ${
            victimSeat?.toUpperCase() ??
            pending?.victimSeat?.toUpperCase() ??
            "opponent"
          }'s hand`,
        );
      } catch {}
    }
    return;
  }
  if (t === "accusationCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingAccusation || (id && s.pendingAccusation.id !== id))
        return s as GameState;
      return { pendingAccusation: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Accusation cancelled");
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
        (c) => c.cardId === stolenCard.cardId && c.name === stolenCard.name,
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
      (p) => p.instanceId === minionRec.instanceId,
    );

    // IMPORTANT: Use victim's owner number so the card returns to the correct hand
    // when detached/moved. The victim is the opposite of the Pith Imp owner.
    const victimOwnerNum: 1 | 2 = victimSeat === "p1" ? 1 : 2;

    let permanentsNext = permanents;
    if (minionIndex !== -1 && stolenCard) {
      // Add stolen card as visual attachment (for display only)
      // Use victimOwnerNum so "move to hand" sends it to the victim's hand
      const stolenVisual = {
        card: { ...stolenCard, pithImpStolen: true } as CardRef,
        owner: victimOwnerNum,
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
        } from ${victimSeat.toUpperCase()}'s hand!`,
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
              (!minionInstanceId || p.minion.instanceId !== minionInstanceId),
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
            (!minionInstanceId || p.minion.instanceId !== minionInstanceId),
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
          } returns to ${victimSeat.toUpperCase()}'s hand (Pith Imp left the realm)`,
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
    const _drawnCardsAny = (msg as { drawnCards?: unknown })
      .drawnCards as unknown; // Unused - state comes from zone patch
    if (!id || !minionAny || !ownerSeat) return;

    // Skip if we're the owner - we already handled it locally via triggerMorganaGenesis
    const actorKey = get().actorKey;
    if (actorKey === ownerSeat) {
      console.log(
        "[Morgana] morganaGenesis: Skipping - we are the owner, already handled locally",
      );
      return;
    }

    const minionRec = minionAny as Record<string, unknown>;
    const drawnCards = Array.isArray(_drawnCardsAny)
      ? (_drawnCardsAny as CardRef[])
      : [];

    // Create Morgana's private hand entry (fallback if patch doesn't arrive)
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

    // Get the drawn cardIds for filtering spellbook
    const drawnCardIds = new Set(drawnCards.map((c) => c.cardId));

    // Always update zones to filter spellbook, and add morganaHand if not exists
    set((s) => {
      // Filter out drawn cards from spellbook (they're now in Morgana's hand)
      const currentSpellbook = s.zones[ownerSeat]?.spellbook || [];
      let cardsToRemove = drawnCards.length;
      const updatedSpellbook = currentSpellbook.filter((card) => {
        // Remove cards matching drawn cardIds, up to the count drawn
        if (cardsToRemove > 0 && drawnCardIds.has(card.cardId)) {
          cardsToRemove--;
          return false;
        }
        return true;
      });

      // Only add morganaHand if not already present (from patch)
      const existingEntry = s.morganaHands.find((m) => m.id === id);
      const updatedMorganaHands = existingEntry
        ? s.morganaHands
        : [...s.morganaHands, newMorganaHand];

      return {
        morganaHands: updatedMorganaHands,
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
        } spell${(drawnCount ?? drawnCards.length) !== 1 ? "s" : ""}`,
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
        }`,
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
          (!minionInstanceId || m.minion.instanceId !== minionInstanceId),
      ),
    })) as unknown as void;

    if (discardedCount && discardedCount > 0) {
      try {
        get().log(
          `Morgana le Fay's remaining ${discardedCount} spell${
            discardedCount !== 1 ? "s" : ""
          } go to graveyard`,
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
        "[Omphalos] omphalosRegister: Skipping - we are the owner, already handled locally",
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
        } enters the realm`,
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

    // Find the Omphalos entry
    const entry = get().omphalosHands.find((o) => o.id === omphalosId);
    const ownerSeat = entry?.ownerSeat;

    // Always update zones to filter spellbook, and add card to omphalosHand if not exists
    if (entry && drawnCard && ownerSeat) {
      set((s) => {
        // Filter out drawn card from spellbook
        const currentSpellbook = s.zones[ownerSeat]?.spellbook || [];
        let removed = false;
        const updatedSpellbook = currentSpellbook.filter((card) => {
          if (!removed && card.cardId === drawnCard.cardId) {
            removed = true;
            return false;
          }
          return true;
        });

        // Only add card if not already in hand (from patch)
        const currentEntry = s.omphalosHands.find((o) => o.id === omphalosId);
        const alreadyHasCard = currentEntry?.hand.some(
          (c) => c.cardId === drawnCard.cardId,
        );

        return {
          omphalosHands: s.omphalosHands.map((o) => {
            if (o.id !== omphalosId) return o;
            if (alreadyHasCard) return o;
            return { ...o, hand: [...o.hand, drawnCard] };
          }),
          zones: {
            ...s.zones,
            [ownerSeat]: {
              ...s.zones[ownerSeat],
              spellbook: updatedSpellbook,
            },
          },
        };
      }) as unknown as void;
    }

    // Re-fetch entry after potential update for logging
    const updatedEntry = get().omphalosHands.find((o) => o.id === omphalosId);
    if (updatedEntry) {
      try {
        get().log(
          `[${updatedEntry.ownerSeat.toUpperCase()}] ${
            updatedEntry.artifact.card.name
          } draws a spell (now has ${newHandSize ?? updatedEntry.hand.length})`,
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
        }${targetTile ? ` at tile ${targetTile.x},${targetTile.y}` : ""}`,
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
        (artifactInstanceId && o.artifact.instanceId === artifactInstanceId),
    );

    // Remove from omphalosHands tracking
    set((s) => ({
      omphalosHands: s.omphalosHands.filter(
        (o) =>
          o.artifact.at !== artifactAt &&
          (!artifactInstanceId || o.artifact.instanceId !== artifactInstanceId),
      ),
    })) as unknown as void;

    if (discardedCount && discardedCount > 0 && entry) {
      try {
        get().log(
          `${entry.artifact.card.name}'s remaining ${discardedCount} spell${
            discardedCount !== 1 ? "s" : ""
          } go to graveyard`,
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
        `[${casterSeat.toUpperCase()}] casts Earthquake - selecting a 2×2 area...`,
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

    // Note: Don't call movePermanentToZone here - the caster's patch handles it.
    // Calling it here causes race conditions since messages arrive before patches.

    set({ pendingEarthquake: null } as Partial<GameState> as GameState);
    try {
      const burrowedList =
        burrowedItems && burrowedItems.length > 0
          ? burrowedItems.map((b) => b.name).join(", ")
          : "no units";
      get().log(
        `[${pending.casterSeat.toUpperCase()}] Earthquake resolved. Burrowed: ${burrowedList}`,
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

  // --- Animist cast choice message handlers ---
  if (t === "animistBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const card = (msg as { card?: unknown }).card as CardRef | undefined;
    const manaCost = (msg as { manaCost?: unknown }).manaCost as
      | number
      | undefined;
    const cellKey = (msg as { cellKey?: unknown }).cellKey as
      | CellKey
      | undefined;
    const handIndex = (msg as { handIndex?: unknown }).handIndex as
      | number
      | undefined;

    if (
      !id ||
      !casterSeat ||
      !card ||
      manaCost === undefined ||
      !cellKey ||
      handIndex === undefined
    )
      return;

    // Opponent sees the Animist choosing how to cast
    set({
      pendingAnimistCast: {
        id,
        casterSeat,
        card,
        manaCost,
        cellKey,
        handIndex,
        status: "choosing",
        chosenMode: null,
      },
    } as Partial<GameState> as GameState);

    try {
      const playerNum = casterSeat === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] is choosing how to cast [p${playerNum}card:${card.name}] (Magic or Spirit)...`,
      );
    } catch {}
    return;
  }

  if (t === "animistResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const mode = (msg as { mode?: unknown }).mode as
      | "magic"
      | "spirit"
      | undefined;

    if (!id || !mode) return;

    const pending = get().pendingAnimistCast;
    if (!pending || pending.id !== id) return;

    // Log the opponent's choice
    try {
      const playerNum = pending.casterSeat === "p1" ? "1" : "2";
      const modeLabel =
        mode === "spirit" ? `Spirit (Power: ${pending.manaCost})` : "Magic";
      get().log(
        `[p${playerNum}:PLAYER] cast [p${playerNum}card:${pending.card.name}] as ${modeLabel}`,
      );
    } catch {}

    // Clear the pending state - the actual card placement comes via server patch
    set({ pendingAnimistCast: null } as Partial<GameState> as GameState);
    return;
  }

  if (t === "animistCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingAnimistCast || (id && s.pendingAnimistCast.id !== id))
        return s as GameState;
      return { pendingAnimistCast: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Animist cast cancelled");
    } catch {}
    return;
  }

  // --- Highland Princess message handlers ---
  if (t === "highlandPrincessBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const minionAny = (msg as { minion?: unknown }).minion as unknown;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const eligibleCount = (msg as { eligibleCount?: unknown }).eligibleCount as
      | number
      | undefined;

    if (!id || !minionAny || !ownerSeat) return;
    const rec = minionAny as Record<string, unknown>;

    set({
      pendingHighlandPrincess: {
        id,
        minion: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        ownerSeat,
        phase: "selecting",
        eligibleCards: [], // Opponent doesn't see the cards
        selectedCard: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${ownerSeat.toUpperCase()}] Highland Princess searches for an artifact (${
          eligibleCount ?? "?"
        } eligible)`,
      );
    } catch {}
    return;
  }

  if (t === "highlandPrincessResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const selectedCardName = (msg as { selectedCardName?: unknown })
      .selectedCardName as string | undefined;

    const pending = get().pendingHighlandPrincess;
    if (!pending || (id && pending.id !== id)) return;

    set({
      pendingHighlandPrincess: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    try {
      if (selectedCardName) {
        get().log(
          `[${pending.ownerSeat.toUpperCase()}] Highland Princess finds ${selectedCardName}`,
        );
      }
    } catch {}

    setTimeout(() => {
      set((state) => {
        if (state.pendingHighlandPrincess?.id === pending.id) {
          return { ...state, pendingHighlandPrincess: null } as GameState;
        }
        return state as GameState;
      });
    }, 500);
    return;
  }

  if (t === "highlandPrincessCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (
        !s.pendingHighlandPrincess ||
        (id && s.pendingHighlandPrincess.id !== id)
      )
        return s as GameState;
      return {
        pendingHighlandPrincess: null,
      } as Partial<GameState> as GameState;
    });
    try {
      get().log("Highland Princess search cancelled");
    } catch {}
    return;
  }

  // --- Black Mass message handlers ---
  if (t === "blackMassBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const topSevenCards = (msg as { topSevenCards?: unknown }).topSevenCards as
      | CardRef[]
      | undefined;
    const eligibleIndices = (msg as { eligibleIndices?: unknown })
      .eligibleIndices as number[] | undefined;
    const allMinionIndices = (msg as { allMinionIndices?: unknown })
      .allMinionIndices as number[] | undefined;

    if (!id || !spellAny || !casterSeat) return;
    const rec = spellAny as Record<string, unknown>;

    set({
      pendingBlackMass: {
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
        topSevenCards: topSevenCards ?? [],
        eligibleIndices: eligibleIndices ?? [],
        allMinionIndices: allMinionIndices ?? eligibleIndices ?? [],
        selectedIndices: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${casterSeat.toUpperCase()}] casts Black Mass - searching top spells`,
      );
    } catch {}
    return;
  }

  if (t === "blackMassResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const selectedCardNames = (msg as { selectedCardNames?: unknown })
      .selectedCardNames as string[] | undefined;

    const pending = get().pendingBlackMass;
    if (!pending || (id && pending.id !== id)) return;

    set({
      pendingBlackMass: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    try {
      if (selectedCardNames && selectedCardNames.length > 0) {
        get().log(
          `[${pending.casterSeat.toUpperCase()}] draws ${
            selectedCardNames.length
          } Evil minion(s)`,
        );
      } else {
        get().log(
          `[${pending.casterSeat.toUpperCase()}] draws no cards from Black Mass`,
        );
      }
    } catch {}

    setTimeout(() => {
      set((state) => {
        if (state.pendingBlackMass?.id === pending.id) {
          return { ...state, pendingBlackMass: null } as GameState;
        }
        return state as GameState;
      });
    }, 500);
    return;
  }

  if (t === "blackMassCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    set((s) => {
      if (!s.pendingBlackMass || (id && s.pendingBlackMass.id !== id))
        return s as GameState;
      return { pendingBlackMass: null } as Partial<GameState> as GameState;
    });
    try {
      get().log("Black Mass cancelled");
    } catch {}
    return;
  }

  // --- Raise Dead message handlers ---
  if (t === "raiseDeadBegin") {
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
    // Opponent sees Raise Dead begin but waits for caster decision
    set({
      pendingRaiseDead: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "confirming",
        eligibleMinions: [], // Opponent doesn't see eligible list
        selectedMinion: null,
        selectedFromSeat: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${casterSeat.toUpperCase()}] casts Raise Dead (${
          eligibleCount ?? "?"
        } dead minions found)`,
      );
    } catch {}
    return;
  }

  if (t === "raiseDeadResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const selectedMinionName = (msg as { selectedMinionName?: unknown })
      .selectedMinionName as string | undefined;
    const selectedFromSeat = (msg as { selectedFromSeat?: unknown })
      .selectedFromSeat as PlayerKey | undefined;
    const pending = get().pendingRaiseDead;
    if (!pending || (id && pending.id !== id)) return;

    set({ pendingRaiseDead: null } as Partial<GameState> as GameState);
    const fromPlayerStr =
      selectedFromSeat === casterSeat ? "their own" : "opponent's";
    try {
      get().log(
        `[${casterSeat?.toUpperCase() ?? "PLAYER"}] Raise Dead summons ${
          selectedMinionName ?? "a minion"
        } from ${fromPlayerStr} graveyard!`,
      );
    } catch {}
    return;
  }

  if (t === "raiseDeadCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    set((s) => {
      if (!s.pendingRaiseDead || (id && s.pendingRaiseDead.id !== id))
        return s as GameState;
      return { pendingRaiseDead: null } as Partial<GameState> as GameState;
    });
    try {
      get().log(
        `[${
          casterSeat?.toUpperCase() ?? "PLAYER"
        }] Raise Dead: Manual resolution chosen`,
      );
    } catch {}
    return;
  }

  // --- Legion of Gall message handlers ---
  if (t === "legionOfGallBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const targetSeat = (msg as { targetSeat?: unknown }).targetSeat as
      | PlayerKey
      | undefined;
    if (!id || !spellAny || !casterSeat || !targetSeat) return;
    const rec = spellAny as Record<string, unknown>;
    set({
      pendingLegionOfGall: {
        id,
        casterSeat,
        targetSeat,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        phase: "confirming",
        selectedIndices: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${casterSeat.toUpperCase()}] casts Legion of Gall - awaiting confirmation`,
      );
    } catch {}
    return;
  }

  if (t === "legionOfGallConfirm") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const targetSeat = (msg as { targetSeat?: unknown }).targetSeat as
      | PlayerKey
      | undefined;
    const pending = get().pendingLegionOfGall;
    if (!pending || (id && pending.id !== id)) return;
    if (!casterSeat || !targetSeat) return;

    set({
      pendingLegionOfGall: {
        ...pending,
        phase: "viewing",
      },
    } as Partial<GameState> as GameState);
    try {
      get().log(
        `[${casterSeat.toUpperCase()}] Legion of Gall: inspecting ${targetSeat.toUpperCase()}'s collection...`,
      );
    } catch {}
    return;
  }

  if (t === "legionOfGallSelect") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const selectedIndices = (msg as { selectedIndices?: unknown })
      .selectedIndices as number[] | undefined;
    const pending = get().pendingLegionOfGall;
    if (!pending || (id && pending.id !== id)) return;
    if (!Array.isArray(selectedIndices)) return;

    set({
      pendingLegionOfGall: {
        ...pending,
        selectedIndices,
        phase: "selecting",
      },
    } as Partial<GameState> as GameState);
    return;
  }

  if (t === "legionOfGallResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const targetSeat = (msg as { targetSeat?: unknown }).targetSeat as
      | PlayerKey
      | undefined;
    const selectedIndices = (msg as { selectedIndices?: unknown })
      .selectedIndices as number[] | undefined;
    const cardsToBanish = (msg as { cardsToBanish?: unknown }).cardsToBanish as
      | CardRef[]
      | undefined;

    if (!id || !casterSeat || !targetSeat) return;

    // Skip if we're the caster - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === casterSeat) {
      set({ pendingLegionOfGall: null } as Partial<GameState> as GameState);
      return;
    }

    // We are the target (victim) - update our own zones
    if (actorKey === targetSeat && cardsToBanish && selectedIndices) {
      const zones = get().zones;
      const collection = [...(zones[targetSeat]?.collection || [])];
      const banished = [...(zones[targetSeat]?.banished || [])];

      // Remove cards from collection (indices are already sorted descending)
      selectedIndices.forEach((idx) => {
        if (idx >= 0 && idx < collection.length) {
          collection.splice(idx, 1);
        }
      });

      // Add cards to banished
      banished.push(...cardsToBanish);

      const zonesNext = {
        ...zones,
        [targetSeat]: {
          ...zones[targetSeat],
          collection,
          banished,
        },
      };

      set({
        zones: zonesNext,
        pendingLegionOfGall: null,
      } as Partial<GameState> as GameState);

      // CRITICAL: Persist zone changes to server - we're updating OUR OWN seat so this is allowed
      try {
        get().trySendPatch({
          zones: { [targetSeat]: zonesNext[targetSeat] } as Record<
            PlayerKey,
            Zones
          >,
        });
      } catch {}

      const cardNames = cardsToBanish
        .map((c) => (c as CardRef).name || "Unknown")
        .join(", ");
      try {
        get().log(
          `[${casterSeat.toUpperCase()}] Legion of Gall: banished ${
            cardsToBanish.length
          } cards from ${targetSeat.toUpperCase()}'s collection: ${cardNames}`,
        );
      } catch {}
    } else {
      // Spectator or other case - just clear pending state
      set({ pendingLegionOfGall: null } as Partial<GameState> as GameState);
      try {
        get().log(
          `[${casterSeat?.toUpperCase() ?? "PLAYER"}] Legion of Gall: banished ${
            selectedIndices?.length ?? 0
          } cards from ${targetSeat?.toUpperCase() ?? "opponent"}'s collection`,
        );
      } catch {}
    }
    return;
  }

  if (t === "legionOfGallCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    set((s) => {
      if (!s.pendingLegionOfGall || (id && s.pendingLegionOfGall.id !== id))
        return s as GameState;
      return { pendingLegionOfGall: null } as Partial<GameState> as GameState;
    });
    try {
      get().log(
        `[${casterSeat?.toUpperCase() ?? "PLAYER"}] Legion of Gall cancelled`,
      );
    } catch {}
    return;
  }

  // --- Auto-Resolve Confirmation message handlers ---
  if (t === "autoResolveBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const kind = (msg as { kind?: unknown }).kind as string | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const sourceName = (msg as { sourceName?: unknown }).sourceName as
      | string
      | undefined;
    const effectDescription = (msg as { effectDescription?: unknown })
      .effectDescription as string | undefined;

    if (!id || !kind || !ownerSeat || !sourceName) return;

    set({
      pendingAutoResolve: {
        id,
        kind: kind as import("./types").AutoResolveKind,
        ownerSeat,
        sourceName,
        effectDescription: effectDescription ?? "",
        callbackData: {},
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);
    return;
  }

  if (t === "autoResolveConfirm") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const sourceName = (msg as { sourceName?: unknown }).sourceName as
      | string
      | undefined;

    set((s) => {
      if (!s.pendingAutoResolve || (id && s.pendingAutoResolve.id !== id))
        return s as GameState;
      return { pendingAutoResolve: null } as Partial<GameState> as GameState;
    });
    try {
      get().log(
        `[${ownerSeat?.toUpperCase() ?? "PLAYER"}] ${
          sourceName ?? "Effect"
        }: Auto-resolved`,
      );
    } catch {}
    return;
  }

  if (t === "autoResolveCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const sourceName = (msg as { sourceName?: unknown }).sourceName as
      | string
      | undefined;

    set((s) => {
      if (!s.pendingAutoResolve || (id && s.pendingAutoResolve.id !== id))
        return s as GameState;
      return { pendingAutoResolve: null } as Partial<GameState> as GameState;
    });
    try {
      get().log(
        `[${ownerSeat?.toUpperCase() ?? "PLAYER"}] ${
          sourceName ?? "Effect"
        }: Manual resolution chosen`,
      );
    } catch {}
    return;
  }

  // --- Mother Nature message handlers ---
  if (t === "motherNatureRevealBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const motherNatureInstanceId = (msg as { motherNatureInstanceId?: unknown })
      .motherNatureInstanceId as string | undefined;
    const motherNatureLocation = (msg as { motherNatureLocation?: unknown })
      .motherNatureLocation as string | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const revealedCard = (msg as { revealedCard?: unknown }).revealedCard as
      | CardRef
      | undefined;
    const isMinion = (msg as { isMinion?: unknown }).isMinion as
      | boolean
      | undefined;

    if (!id || !motherNatureInstanceId || !motherNatureLocation || !ownerSeat)
      return;

    set({
      pendingMotherNatureReveal: {
        id,
        motherNatureInstanceId,
        motherNatureLocation,
        ownerSeat,
        phase: isMinion ? "choosing" : "revealing",
        revealedCard: revealedCard ?? null,
        isMinion: isMinion ?? false,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${ownerSeat.toUpperCase()}] Mother Nature reveals ${
          revealedCard?.name ?? "a card"
        }`,
      );
    } catch {}

    // If not a minion, auto-complete after delay
    if (!isMinion) {
      setTimeout(() => {
        set((state) => {
          if (state.pendingMotherNatureReveal?.id === id) {
            return {
              ...state,
              pendingMotherNatureReveal: {
                ...state.pendingMotherNatureReveal,
                phase: "complete",
              },
            } as GameState;
          }
          return state as GameState;
        });
        setTimeout(() => {
          set((state) => {
            if (state.pendingMotherNatureReveal?.id === id) {
              return { ...state, pendingMotherNatureReveal: null } as GameState;
            }
            return state as GameState;
          });
        }, 1500);
      }, 2000);
    }
    return;
  }

  if (t === "motherNatureRevealResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const accepted = (msg as { accepted?: unknown }).accepted as
      | boolean
      | undefined;
    const revealedCardName = (msg as { revealedCardName?: unknown })
      .revealedCardName as string | undefined;

    const pending = get().pendingMotherNatureReveal;
    if (!pending || (id && pending.id !== id)) return;

    set({
      pendingMotherNatureReveal: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    try {
      if (accepted) {
        get().log(
          `[${pending.ownerSeat.toUpperCase()}] Mother Nature summons ${
            revealedCardName ?? "a minion"
          }!`,
        );
      } else {
        get().log(
          `[${pending.ownerSeat.toUpperCase()}] declines to summon ${
            revealedCardName ?? "the minion"
          }`,
        );
      }
    } catch {}

    setTimeout(() => {
      set((state) => {
        if (state.pendingMotherNatureReveal?.id === pending.id) {
          return { ...state, pendingMotherNatureReveal: null } as GameState;
        }
        return state as GameState;
      });
    }, 1000);
    return;
  }

  // --- Lilith message handlers ---
  // Handle request from Lilith owner asking for our top card
  if (t === "lilithRevealRequest") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const lilithInstanceId = (msg as { lilithInstanceId?: unknown })
      .lilithInstanceId as string | undefined;
    const lilithLocation = (msg as { lilithLocation?: unknown })
      .lilithLocation as CellKey | undefined;
    const lilithOwner = (msg as { lilithOwner?: unknown }).lilithOwner as
      | PlayerKey
      | undefined;

    if (!id || !lilithInstanceId || !lilithLocation || !lilithOwner) return;

    const actorKey = get().actorKey;
    const zones = get().zones;

    // Only respond if we are the opponent (not the Lilith owner)
    if (actorKey && actorKey !== lilithOwner) {
      const ourSpellbook = [...(zones[actorKey]?.spellbook || [])];
      console.log("[Lilith] Received reveal request, sending our top card:", {
        actorKey,
        spellbookLength: ourSpellbook.length,
        topCard: ourSpellbook[0]?.name || "none",
      });

      if (ourSpellbook.length === 0) {
        // Send empty response
        const transport = get().transport;
        if (transport?.sendMessage) {
          try {
            transport.sendMessage({
              type: "lilithRevealResponse",
              id,
              lilithInstanceId,
              lilithLocation,
              lilithOwner,
              revealedCard: null,
              isMinion: false,
              isEmpty: true,
              ts: Date.now(),
            } as unknown as { type: string });
          } catch {}
        }
        return;
      }

      const revealedCard = ourSpellbook[0];

      // Determine if it's a minion
      const metaByCardId = get().metaByCardId;
      const meta = metaByCardId[revealedCard.cardId] as
        | { type?: string }
        | undefined;
      const cardType = (meta?.type || revealedCard.type || "").toLowerCase();
      const isMinion = cardType.includes("minion");

      // Send our top card to the Lilith owner
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "lilithRevealResponse",
            id,
            lilithInstanceId,
            lilithLocation,
            lilithOwner,
            revealedCard,
            isMinion,
            isEmpty: false,
            ts: Date.now(),
          } as unknown as { type: string });
        } catch {}
      }

      // Show the reveal on our side too
      set({
        pendingLilithReveal: {
          id,
          lilithInstanceId,
          lilithLocation,
          lilithOwner,
          phase: "revealing",
          revealedCard,
          isMinion,
          createdAt: Date.now(),
        },
      } as Partial<GameState> as GameState);

      try {
        get().log(
          `[${lilithOwner.toUpperCase()}] Lilith reveals ${
            revealedCard.name
          } from your spellbook`,
        );
      } catch {}
    }
    return;
  }

  // Handle response from opponent with their top card
  if (t === "lilithRevealResponse") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const lilithInstanceId = (msg as { lilithInstanceId?: unknown })
      .lilithInstanceId as string | undefined;
    const lilithLocation = (msg as { lilithLocation?: unknown })
      .lilithLocation as CellKey | undefined;
    const lilithOwner = (msg as { lilithOwner?: unknown }).lilithOwner as
      | PlayerKey
      | undefined;
    const revealedCard = (msg as { revealedCard?: unknown }).revealedCard as
      | CardRef
      | null
      | undefined;
    const isMinion = (msg as { isMinion?: unknown }).isMinion as
      | boolean
      | undefined;
    const isEmpty = (msg as { isEmpty?: unknown }).isEmpty as
      | boolean
      | undefined;

    if (!id || !lilithInstanceId || !lilithLocation || !lilithOwner) return;

    console.log("[Lilith] Received reveal response:", {
      id,
      revealedCard: revealedCard?.name || "none",
      isMinion,
      isEmpty,
    });

    if (isEmpty) {
      // Opponent's spellbook is empty
      set({ pendingLilithReveal: null } as Partial<GameState> as GameState);
      try {
        get().log(
          `[${lilithOwner.toUpperCase()}] Lilith: Opponent's spellbook is empty`,
        );
      } catch {}
      return;
    }

    // Update the pending reveal with the actual card
    set({
      pendingLilithReveal: {
        id,
        lilithInstanceId,
        lilithLocation,
        lilithOwner,
        phase: "revealing",
        revealedCard: revealedCard ?? null,
        isMinion: isMinion ?? false,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${lilithOwner.toUpperCase()}] Lilith reveals ${
          revealedCard?.name ?? "a card"
        } from opponent's spellbook`,
      );
    } catch {}
    return;
  }

  if (t === "lilithRevealBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const lilithInstanceId = (msg as { lilithInstanceId?: unknown })
      .lilithInstanceId as string | undefined;
    const lilithLocation = (msg as { lilithLocation?: unknown })
      .lilithLocation as CellKey | undefined;
    const lilithOwner = (msg as { lilithOwner?: unknown }).lilithOwner as
      | PlayerKey
      | undefined;
    const revealedCard = (msg as { revealedCard?: unknown }).revealedCard as
      | CardRef
      | undefined;
    const isMinion = (msg as { isMinion?: unknown }).isMinion as
      | boolean
      | undefined;

    if (!id || !lilithInstanceId || !lilithLocation || !lilithOwner) return;

    set({
      pendingLilithReveal: {
        id,
        lilithInstanceId,
        lilithLocation,
        lilithOwner,
        phase: "revealing",
        revealedCard: revealedCard ?? null,
        isMinion: isMinion ?? false,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${lilithOwner.toUpperCase()}] Lilith reveals ${
          revealedCard?.name ?? "a card"
        } from opponent's spellbook`,
      );
    } catch {}
    return;
  }

  if (t === "lilithRevealResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const isMinion = (msg as { isMinion?: unknown }).isMinion as
      | boolean
      | undefined;
    const lilithOwner = (msg as { lilithOwner?: unknown }).lilithOwner as
      | PlayerKey
      | undefined;
    const revealedCard = (msg as { revealedCard?: unknown }).revealedCard as
      | CardRef
      | undefined;
    const revealedCardName = (msg as { revealedCardName?: unknown })
      .revealedCardName as string | undefined;

    const pending = get().pendingLilithReveal;
    const actorKey = get().actorKey;

    console.log("[Lilith] Received lilithRevealResolve:", {
      id,
      isMinion,
      lilithOwner,
      revealedCardName,
      actorKey,
      pendingId: pending?.id,
      pendingPhase: pending?.phase,
    });

    if (!pending || (id && pending.id !== id)) {
      console.log("[Lilith] Skipping resolve - no pending or ID mismatch");
      return;
    }

    const effectiveLilithOwner = lilithOwner || pending.lilithOwner;

    // If we are the opponent (not the Lilith owner), we need to modify our spellbook
    if (actorKey && actorKey !== effectiveLilithOwner) {
      console.log("[Lilith] We are opponent, modifying our spellbook");
      const zones = get().zones;
      const ourSpellbook = [...(zones[actorKey]?.spellbook || [])];

      console.log("[Lilith] Spellbook before modification:", {
        length: ourSpellbook.length,
        topCard: ourSpellbook[0]?.name || "none",
      });

      if (ourSpellbook.length > 0) {
        // Remove the top card
        const removedCard = ourSpellbook.shift();
        console.log("[Lilith] Removed top card:", removedCard?.name);

        if (!isMinion && revealedCard) {
          // Not a minion - put at bottom of our spellbook
          ourSpellbook.push(revealedCard);
          console.log("[Lilith] Added card to bottom:", revealedCard.name);
        }

        console.log("[Lilith] Spellbook after modification:", {
          length: ourSpellbook.length,
        });

        // Update our zones
        const zonesNext = {
          ...zones,
          [actorKey]: {
            ...zones[actorKey],
            spellbook: ourSpellbook,
          },
        };

        set({
          zones: zonesNext,
          pendingLilithReveal: { ...pending, phase: "complete" },
        } as Partial<GameState> as GameState);

        // Send patch - send full zones for seat to prevent partial patch issues
        console.log("[Lilith] Sending zones patch");
        get().trySendPatch({
          zones: {
            [actorKey]: zonesNext[actorKey],
          },
        } as unknown as ServerPatchT);
      } else {
        console.log("[Lilith] Spellbook empty, nothing to modify");
        set({
          pendingLilithReveal: { ...pending, phase: "complete" },
        } as Partial<GameState> as GameState);
      }
    } else {
      // We are the Lilith owner - just update phase (we already handled our part)
      console.log("[Lilith] We are Lilith owner, just updating phase");
      set({
        pendingLilithReveal: { ...pending, phase: "complete" },
      } as Partial<GameState> as GameState);
    }

    try {
      if (isMinion) {
        get().log(
          `[${effectiveLilithOwner.toUpperCase()}] Lilith summons ${
            revealedCardName ?? "a minion"
          }!`,
        );
      } else {
        get().log(`${revealedCardName ?? "Card"} goes to bottom of spellbook`);
      }
    } catch {}

    // Clear pending after a short delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingLilithReveal?.id === pending.id) {
          return {
            ...state,
            pendingLilithReveal: null,
          } as GameState;
        }
        return state as GameState;
      });
    }, 500);
    return;
  }

  // --- Pigs of the Sounder / Squeakers Deathrite message handlers ---
  if (t === "pigsDeathrite") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const deathLocation = (msg as { deathLocation?: unknown }).deathLocation as
      | CellKey
      | undefined;
    const triggerCardName = (msg as { triggerCardName?: unknown })
      .triggerCardName as string | undefined;
    const targetCardName = (msg as { targetCardName?: unknown })
      .targetCardName as string | undefined;
    const revealedCardNames = (msg as { revealedCards?: unknown })
      .revealedCards as string[] | undefined;
    // pigsCount used for logging
    const _pigsCount = (msg as { pigsCount?: unknown }).pigsCount as
      | number
      | undefined;

    if (!id || !ownerSeat || !deathLocation) return;

    // Skip if we're the owner - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === ownerSeat) {
      console.log(
        "[Pigs] pigsDeathrite: Skipping - we are the owner, already handled locally",
      );
      return;
    }

    // Create pending state for opponent to see the reveal
    // Note: We don't have the full CardRef objects, just names for display
    const revealedCards: CardRef[] = (revealedCardNames || []).map(
      (name, idx) => ({
        cardId: -1 - idx, // Placeholder ID
        name,
        slug: "",
        type: "", // Placeholder type for display purposes
      }),
    );

    const pendingPigs = {
      id,
      ownerSeat,
      deathLocation,
      triggerCardName: triggerCardName || "Pigs of the Sounder",
      targetCardName: targetCardName || "grand old boar",
      phase: "revealing" as const,
      revealedCards,
      pigsToSummon: [], // Opponent doesn't need to track these
      cardsToBottom: [],
      createdAt: Date.now(),
    };

    set({
      pendingPigsOfTheSounder: pendingPigs,
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${ownerSeat.toUpperCase()}] ${
          triggerCardName || "Pigs of the Sounder"
        } Deathrite reveals ${revealedCards.length} cards`,
      );
    } catch {}
    return;
  }

  if (t === "pigsDeathResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const summonedCount = (msg as { summonedCount?: unknown }).summonedCount as
      | number
      | undefined;

    if (!id) return;

    // Skip if we're the owner - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === ownerSeat) {
      console.log(
        "[Pigs] pigsDeathResolve: Skipping - we are the owner, already handled locally",
      );
      return;
    }

    const pending = get().pendingPigsOfTheSounder;
    if (pending?.id === id) {
      // Update phase to complete, then clear after a short delay
      set({
        pendingPigsOfTheSounder: { ...pending, phase: "complete" },
      } as Partial<GameState> as GameState);

      try {
        if ((summonedCount ?? 0) > 0) {
          get().log(
            `[${ownerSeat?.toUpperCase() || "??"}] ${
              pending.triggerCardName
            } summons ${summonedCount} ${pending.targetCardName}!`,
          );
        } else {
          get().log(
            `[${ownerSeat?.toUpperCase() || "??"}] ${
              pending.triggerCardName
            } finds no ${pending.targetCardName}`,
          );
        }
      } catch {}

      // Clear pending after a short delay
      setTimeout(() => {
        set((state) => {
          if (state.pendingPigsOfTheSounder?.id === id) {
            return {
              ...state,
              pendingPigsOfTheSounder: null,
            } as GameState;
          }
          return state as GameState;
        });
      }, 1500);
    }
    return;
  }

  // --- Headless Haunt message handlers ---
  // Broadcast when Headless Haunt start-of-turn movement begins
  if (t === "headlessHauntBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const ownerSeat = (msg as { ownerSeat?: unknown }).ownerSeat as
      | PlayerKey
      | undefined;
    const haunts = (msg as { haunts?: unknown }).haunts as
      | Array<{
          instanceId: string;
          location: CellKey;
          ownerSeat: PlayerKey;
          cardName: string;
          permanentIndex: number;
        }>
      | undefined;
    const hasKythera = (msg as { hasKythera?: unknown }).hasKythera as
      | boolean
      | undefined;

    if (!id || !ownerSeat || !haunts) return;

    // Skip if we're the owner - we already set the state locally
    const actorKey = get().actorKey;
    if (actorKey === ownerSeat) return;

    set({
      pendingHeadlessHauntMove: {
        id,
        ownerSeat,
        haunts,
        currentIndex: 0,
        phase: hasKythera ? "choosing" : "pending",
        hasKythera: hasKythera ?? false,
        selectedTile: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      if (hasKythera) {
        get().log(
          `[${ownerSeat.toUpperCase()}] Kythera Mechanism allows choosing haunt movement`,
        );
      }
    } catch {}
    return;
  }

  // Handle partial resolution (one haunt moved, more to go - Kythera mode only)
  if (t === "headlessHauntPartialResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const hauntIndex = (msg as { hauntIndex?: unknown }).hauntIndex as
      | number
      | undefined;
    const movedTo = (msg as { movedTo?: unknown }).movedTo as
      | CellKey
      | undefined;

    if (!id) return;

    const pending = get().pendingHeadlessHauntMove;
    if (!pending || pending.id !== id) return;

    // Skip if we're the owner - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === pending.ownerSeat) return;

    // Move to next haunt
    set({
      pendingHeadlessHauntMove: {
        ...pending,
        currentIndex: (hauntIndex ?? 0) + 1,
        selectedTile: null,
        phase: "choosing",
      },
    } as Partial<GameState> as GameState);

    if (movedTo && hauntIndex !== undefined && pending.haunts[hauntIndex]) {
      try {
        const haunt = pending.haunts[hauntIndex];
        get().log(
          `[${pending.ownerSeat.toUpperCase()}] ${
            haunt.cardName
          } moves (Kythera Mechanism)`,
        );
      } catch {}
    }
    return;
  }

  // Handle skip (Kythera mode - player chose not to move)
  if (t === "headlessHauntSkip") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const hauntIndex = (msg as { hauntIndex?: unknown }).hauntIndex as
      | number
      | undefined;

    if (!id) return;

    const pending = get().pendingHeadlessHauntMove;
    if (!pending || pending.id !== id) return;

    // Skip if we're the owner - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === pending.ownerSeat) return;

    const nextIndex = (hauntIndex ?? 0) + 1;
    if (nextIndex >= pending.haunts.length) {
      // All done
      set({
        pendingHeadlessHauntMove: { ...pending, phase: "complete" },
      } as Partial<GameState> as GameState);

      setTimeout(() => {
        set((state) => {
          if (state.pendingHeadlessHauntMove?.id === id) {
            return { ...state, pendingHeadlessHauntMove: null } as GameState;
          }
          return state as GameState;
        });
      }, 500);
    } else {
      // Move to next haunt
      set({
        pendingHeadlessHauntMove: {
          ...pending,
          currentIndex: nextIndex,
          selectedTile: null,
        },
      } as Partial<GameState> as GameState);
    }

    if (hauntIndex !== undefined && pending.haunts[hauntIndex]) {
      try {
        const haunt = pending.haunts[hauntIndex];
        get().log(
          `[${pending.ownerSeat.toUpperCase()}] chooses not to move ${
            haunt.cardName
          }`,
        );
      } catch {}
    }
    return;
  }

  // Handle full resolution (all haunts processed)
  if (t === "headlessHauntResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const movedHaunts = (msg as { movedHaunts?: unknown }).movedHaunts as
      | Array<{ cardName: string; from: CellKey; to: CellKey }>
      | undefined;
    const hasKythera = (msg as { hasKythera?: unknown }).hasKythera as
      | boolean
      | undefined;

    if (!id) return;

    const pending = get().pendingHeadlessHauntMove;
    if (!pending || pending.id !== id) return;

    // Skip if we're the owner - we already handled it locally
    const actorKey = get().actorKey;
    if (actorKey === pending.ownerSeat) return;

    set({
      pendingHeadlessHauntMove: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Log moves
    try {
      const boardWidth = get().board.size.w;
      const playerNum = pending.ownerSeat === "p1" ? "1" : "2";
      for (const move of movedHaunts ?? []) {
        const [toX, toY] = move.to.split(",").map(Number);
        const cellNo = toY * boardWidth + toX + 1;
        if (hasKythera) {
          get().log(
            `[p${playerNum}card:${move.cardName}] moves to #${cellNo} (Kythera Mechanism)`,
          );
        } else {
          get().log(
            `[p${playerNum}card:${move.cardName}] wanders to #${cellNo}`,
          );
        }
      }
    } catch {}

    // Clear after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingHeadlessHauntMove?.id === id) {
          return { ...state, pendingHeadlessHauntMove: null } as GameState;
        }
        return state as GameState;
      });
    }, 1500);
    return;
  }

  // --- Interrogator Avatar Ability (Gothic expansion) ---
  // Triggered when an ally strikes an enemy avatar
  if (t === "interrogatorTrigger") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const interrogatorSeat = (msg as { interrogatorSeat?: unknown })
      .interrogatorSeat as PlayerKey | undefined;
    const victimSeat = (msg as { victimSeat?: unknown }).victimSeat as
      | PlayerKey
      | undefined;
    const attackerName = (msg as { attackerName?: unknown }).attackerName as
      | string
      | undefined;

    console.log("[interrogatorTrigger] Received:", {
      id,
      interrogatorSeat,
      victimSeat,
      attackerName,
    });

    if (!id || !interrogatorSeat || !victimSeat) return;

    // Skip if we're the interrogator - we already have the state
    const actorKey = get().actorKey;
    console.log(
      "[interrogatorTrigger] actorKey:",
      actorKey,
      "skipping:",
      actorKey === interrogatorSeat,
    );
    if (actorKey === interrogatorSeat) return;

    set({
      pendingInterrogatorChoice: {
        id,
        interrogatorSeat,
        victimSeat,
        attackerName: attackerName ?? "Minion",
        phase: "pending",
        choice: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      const interrogatorAvatarName =
        get().avatars?.[interrogatorSeat]?.card?.name || "Interrogator";
      get().log(
        `[p${
          interrogatorSeat === "p1" ? "1" : "2"
        }:${interrogatorAvatarName}] ability triggers: ${victimSeat.toUpperCase()} must pay 3 life or allow a spell draw`,
      );
    } catch {}
    return;
  }

  if (t === "interrogatorResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const choice = (msg as { choice?: unknown }).choice as
      | "pay"
      | "allow"
      | undefined;

    console.log("[interrogatorResolve] Received:", { id, choice });

    if (!id || !choice) return;

    const pending = get().pendingInterrogatorChoice;
    console.log("[interrogatorResolve] pending:", pending);
    if (!pending || pending.id !== id) {
      console.log("[interrogatorResolve] No matching pending, skipping");
      return;
    }

    // Skip if we're the victim - we already handled it locally
    const actorKey = get().actorKey;
    console.log(
      "[interrogatorResolve] actorKey:",
      actorKey,
      "victimSeat:",
      pending.victimSeat,
      "skipping:",
      actorKey === pending.victimSeat,
    );
    if (actorKey === pending.victimSeat) return;

    console.log(
      "[interrogatorResolve] Processing resolution for Interrogator player",
    );

    const { interrogatorSeat, victimSeat } = pending;

    if (choice === "pay") {
      // Victim pays 3 life
      try {
        get().addLife(victimSeat, -3);
      } catch {}
      try {
        get().log(
          `${victimSeat.toUpperCase()} pays 3 life to prevent Interrogator's draw`,
        );
      } catch {}
    } else {
      // Interrogator draws a spell from spellbook
      try {
        get().drawFrom(interrogatorSeat, "spellbook");
      } catch {}
      try {
        get().log(
          `${victimSeat.toUpperCase()} allows Interrogator's draw - ${interrogatorSeat.toUpperCase()} draws a spell`,
        );
      } catch {}
    }

    // Update state to resolved
    set({
      pendingInterrogatorChoice: {
        ...pending,
        phase: "resolved",
        choice,
      },
    } as Partial<GameState> as GameState);

    // Clear after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingInterrogatorChoice?.id === id) {
          return { ...state, pendingInterrogatorChoice: null } as GameState;
        }
        return state as GameState;
      });
    }, 500);
    return;
  }

  // --- Atlantean Fate (4x4 area Aura) ---
  if (t === "atlanteanFateBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const spellAny = (msg as { spell?: unknown }).spell as unknown;

    if (!id || !casterSeat || typeof spellAny !== "object") return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === casterSeat) return;

    const rec = spellAny as Record<string, unknown>;
    set({
      pendingAtlanteanFate: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as GameState["pendingAtlanteanFate"] extends {
            spell: { card: infer C };
          }
            ? C
            : never,
        },
        casterSeat,
        phase: "selectingCorner",
        previewCorner: null,
        selectedCorner: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${casterSeat.toUpperCase()}] casts Atlantean Fate - selecting 4×4 area`,
      );
    } catch {}
    return;
  }

  if (t === "atlanteanFatePreview") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const cornerCell = (msg as { cornerCell?: unknown }).cornerCell as
      | CellKey
      | null
      | undefined;

    if (!id) return;

    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.id !== id) return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.casterSeat) return;

    set({
      pendingAtlanteanFate: {
        ...pending,
        previewCorner: cornerCell ?? null,
      },
    } as Partial<GameState> as GameState);
    return;
  }

  if (t === "atlanteanFateSelect") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const cornerCell = (msg as { cornerCell?: unknown }).cornerCell as
      | CellKey
      | undefined;

    if (!id || !cornerCell) return;

    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.id !== id) return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.casterSeat) return;

    set({
      pendingAtlanteanFate: {
        ...pending,
        selectedCorner: cornerCell,
        phase: "confirming",
      },
    } as Partial<GameState> as GameState);
    return;
  }

  if (t === "atlanteanFateResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const auraAny = (msg as { aura?: unknown }).aura as unknown;

    if (!id || typeof auraAny !== "object") return;

    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.id !== id) return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.casterSeat) return;

    const aura =
      auraAny as GameState["specialSiteState"]["atlanteanFateAuras"][0];

    // Update special site state with the new aura
    const currentState = get().specialSiteState;
    set({
      specialSiteState: {
        ...currentState,
        atlanteanFateAuras: [...currentState.atlanteanFateAuras, aura],
      },
      pendingAtlanteanFate: null,
    } as Partial<GameState> as GameState);

    try {
      const floodCount = aura.floodedSites?.length || 0;
      get().log(
        `Atlantean Fate resolved! ${floodCount} site${
          floodCount !== 1 ? "s" : ""
        } flooded`,
      );
    } catch {}
    return;
  }

  if (t === "atlanteanFateCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;

    if (!id) return;

    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.id !== id) return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.casterSeat) return;

    set({ pendingAtlanteanFate: null } as Partial<GameState> as GameState);

    try {
      get().log("Atlantean Fate cancelled");
    } catch {}
    return;
  }

  // --- Mephistopheles handlers ---
  if (t === "mephistophelesBegin") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;
    const spellAny = (msg as { spell?: unknown }).spell;

    if (!id || !casterSeat || typeof spellAny !== "object") return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === casterSeat) return;

    const rec = spellAny as Record<string, unknown>;
    set({
      pendingMephistopheles: {
        id,
        spell: {
          at: rec.at as CellKey,
          index: Number(rec.index),
          instanceId: (rec.instanceId as string | null) ?? null,
          owner: Number(rec.owner) as 1 | 2,
          card: rec.card as CardRef,
        },
        casterSeat,
        phase: "confirming",
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${casterSeat.toUpperCase()}] Mephistopheles enters - awaiting decision`,
      );
    } catch {}
    return;
  }

  if (t === "mephistophelesResolve") {
    const id = (msg as { id?: unknown }).id as string | undefined;
    const casterSeat = (msg as { casterSeat?: unknown }).casterSeat as
      | PlayerKey
      | undefined;

    if (!id || !casterSeat) return;

    const pending = get().pendingMephistopheles;
    if (!pending || pending.id !== id) return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.casterSeat) return;

    // Clear pending state - actual state changes come via patches
    set({ pendingMephistopheles: null } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${casterSeat.toUpperCase()}] Mephistopheles becomes their new Avatar!`,
      );
    } catch {}
    return;
  }

  if (t === "mephistophelesCancel") {
    const id = (msg as { id?: unknown }).id as string | undefined;

    if (!id) return;

    const pending = get().pendingMephistopheles;
    if (!pending || pending.id !== id) return;

    // Skip if we're the caster - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.casterSeat) return;

    set({ pendingMephistopheles: null } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${pending.casterSeat.toUpperCase()}] Mephistopheles remains as a minion`,
      );
    } catch {}
    return;
  }

  if (t === "mephistophelesSummon") {
    const who = (msg as { who?: unknown }).who as PlayerKey | undefined;
    const card = (msg as { card?: unknown }).card as CardRef | undefined;
    const targetCell = (msg as { targetCell?: unknown }).targetCell as
      | CellKey
      | undefined;

    if (!who || !card || !targetCell) return;

    // Skip if we're the summoner - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === who) return;

    try {
      get().log(
        `[${who.toUpperCase()}] Mephistopheles summons ${
          card.name
        } to the battlefield!`,
      );
    } catch {}
    return;
  }

  // --- Pathfinder message handlers ---
  if (t === "pathfinderBegin") {
    const pending = (msg as { pending?: unknown }).pending as
      | {
          id: string;
          ownerSeat: PlayerKey;
          phase: "selectingTarget";
          topSite: CardRef | null;
          validTargets: CellKey[];
          createdAt: number;
        }
      | undefined;

    if (!pending) return;

    // Skip if we're the owner - we already set the state locally
    const actorKey = get().actorKey;
    if (actorKey === pending.ownerSeat) return;

    set({ pendingPathfinderPlay: pending } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${pending.ownerSeat.toUpperCase()}] Pathfinder selecting target for ${
          pending.topSite?.name
        }`,
      );
    } catch {}
    return;
  }

  if (t === "pathfinderResolve") {
    const targetCell = (msg as { targetCell?: unknown }).targetCell as
      | CellKey
      | undefined;
    const topSite = (msg as { topSite?: unknown }).topSite as
      | CardRef
      | undefined;

    if (!targetCell || !topSite) return;

    // Clear the pending state for opponent
    const pending = get().pendingPathfinderPlay;
    if (!pending) return;

    // Skip if we're the owner - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.ownerSeat) return;

    set({ pendingPathfinderPlay: null } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${pending.ownerSeat.toUpperCase()}] Pathfinder plays ${
          topSite.name
        } and moves there`,
      );
    } catch {}
    return;
  }

  if (t === "pathfinderCancel") {
    const pending = get().pendingPathfinderPlay;
    if (!pending) return;

    // Skip if we're the owner - we already have the state
    const actorKey = get().actorKey;
    if (actorKey === pending.ownerSeat) return;

    set({ pendingPathfinderPlay: null } as Partial<GameState> as GameState);

    try {
      get().log(
        `[${pending.ownerSeat.toUpperCase()}] Pathfinder play cancelled`,
      );
    } catch {}
    return;
  }
}
