import type { StateCreator } from "zustand";
import { extractMagicTargetingHintsSync } from "@/lib/game/cardAbilities";
import type { CustomMessage } from "@/lib/net/transport";
import type { CellKey, GameState } from "./types";
import { getCellNumber, seatFromOwner } from "./utils/boardHelpers";

function newMagicId() {
  return `mag_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type MagicSlice = Pick<
  GameState,
  | "pendingMagic"
  | "beginMagicCast"
  | "setMagicCasterChoice"
  | "setMagicTargetChoice"
  | "confirmMagic"
  | "resolveMagic"
  | "cancelMagic"
>;

export const createMagicSlice: StateCreator<GameState, [], [], MagicSlice> = (
  set,
  get
) => ({
  pendingMagic: null,

  beginMagicCast: (input) => {
    const id = newMagicId();
    const spell = input.spell;
    const tile = input.tile;
    const createdAt = Date.now();
    const ownerSeat = seatFromOwner(spell.owner);
    const autoCaster =
      input.presetCaster ?? ({ kind: "avatar", seat: ownerSeat } as const);
    const hints = extractMagicTargetingHintsSync(spell.card?.name || "", null);
    set({
      pendingMagic: {
        id,
        tile,
        spell,
        caster: autoCaster,
        target: null,
        status: "choosingTarget",
        hints,
        createdAt,
      },
    } as Partial<GameState> as GameState);
    // Prefetch rules text early to avoid delay later
    try {
      const cardName = spell.card?.name || "";
      if (cardName) {
        void (async () => {
          try {
            const res = await fetch(
              `/api/cards/rules?name=${encodeURIComponent(cardName)}`
            );
            if (!res.ok) return;
            const data = (await res.json()) as { rulesText?: string | null };
            const rulesText = (data?.rulesText ?? null) as string | null;
            set((s) => {
              if (!s.pendingMagic || s.pendingMagic.id !== id)
                return s as GameState;
              return {
                pendingMagic: { ...s.pendingMagic, summaryText: rulesText },
              } as Partial<GameState> as GameState;
            });
          } catch {}
        })();
      }
    } catch {}
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        // Broadcast magic begin for sync
        transport.sendMessage({
          type: "magicBegin",
          id,
          tile,
          spell,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        // Also show a toast for UX feedback
        const cardName = spell.card?.name || "Magic";
        const cellNo = getCellNumber(tile.x, tile.y, get().board.size.w);
        transport.sendMessage({
          type: "toast",
          text: `Casting '${cardName}' at #${cellNo}`,
        } as unknown as CustomMessage);
        // Immediately broadcast chosen caster (avatar by default)
        transport.sendMessage({
          type: "magicSetCaster",
          id,
          caster: autoCaster,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  setMagicCasterChoice: (caster) => {
    const id = get().pendingMagic?.id || null;
    set((state) => {
      if (!state.pendingMagic) return state as GameState;
      return {
        pendingMagic: {
          ...state.pendingMagic,
          caster: caster ?? null,
          status: caster ? "choosingTarget" : "choosingCaster",
        },
      } as Partial<GameState> as GameState;
    });
    const transport = get().transport;
    if (transport?.sendMessage && id) {
      try {
        transport.sendMessage({
          type: "magicSetCaster",
          id,
          caster: caster ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  setMagicTargetChoice: (target) => {
    const id = get().pendingMagic?.id || null;
    set((state) => {
      if (!state.pendingMagic) return state as GameState;
      return {
        pendingMagic: {
          ...state.pendingMagic,
          target: target ?? null,
          // Stay in choosingTarget until actor explicitly confirms
          status: "choosingTarget",
        },
      } as Partial<GameState> as GameState;
    });
    const transport = get().transport;
    if (transport?.sendMessage && id) {
      try {
        transport.sendMessage({
          type: "magicSetTarget",
          id,
          target: target ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  confirmMagic: () => {
    set((state) => {
      if (!state.pendingMagic) return state as GameState;
      return {
        pendingMagic: {
          ...state.pendingMagic,
          status: "confirm",
        },
      } as Partial<GameState> as GameState;
    });
    try {
      const pending = get().pendingMagic;
      const transport = get().transport;
      if (pending && transport?.sendMessage) {
        transport.sendMessage({
          type: "magicConfirm",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      }
    } catch {}
    // Proactively fetch rules (or use cache) and emit a summary so both players can review before resolution
    try {
      const pending = get().pendingMagic;
      if (!pending) return;
      const nm = pending.spell.card?.name || "Magic";
      void (async () => {
        let rulesText: string | null = get().pendingMagic?.summaryText ?? null;
        if (rulesText === null) {
          try {
            const res = await fetch(
              `/api/cards/rules?name=${encodeURIComponent(nm)}`
            );
            if (res.ok) {
              const data = (await res.json()) as { rulesText?: string | null };
              rulesText = (data?.rulesText ?? null) as string | null;
            }
          } catch {}
        }
        set((s) => {
          if (!s.pendingMagic || s.pendingMagic.id !== pending.id)
            return s as GameState;
          return {
            pendingMagic: { ...s.pendingMagic, summaryText: rulesText },
          } as Partial<GameState> as GameState;
        });
        const transport = get().transport;
        if (transport?.sendMessage) {
          try {
            transport.sendMessage({
              type: "magicSummary",
              id: pending.id,
              text: rulesText ?? "",
              ts: Date.now(),
            } as unknown as CustomMessage);
          } catch {}
        }
      })();
    } catch {}
  },

  resolveMagic: () => {
    const pending = get().pendingMagic;
    if (!pending) return;
    const at = pending.spell.at as CellKey;
    const index = Number(pending.spell.index);
    try {
      get().movePermanentToZone(at, index, "graveyard");
    } catch {}
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        const nm = pending.spell.card?.name || "Magic";
        // Heuristic: fetch rules to extract intended damage amount (first integer in text)
        const fetchRulesText = async (name: string): Promise<string | null> => {
          try {
            const res = await fetch(
              `/api/cards/rules?name=${encodeURIComponent(name)}`
            );
            if (!res.ok) return null;
            const data = (await res.json()) as { rulesText?: string | null };
            return (data?.rulesText ?? null) as string | null;
          } catch {
            return null;
          }
        };
        const parseDamageAmount = (
          text: string | null,
          fallback = 1
        ): number => {
          if (!text) return fallback;
          const m =
            text.match(/(?:deal|deals)?\s*(\d+)/i) || text.match(/(\d+)/);
          const n = m ? Number(m[1]) : NaN;
          return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
        };

        // Compute projectile first-hit using board state
        const computeProjectileFirstHit = (): {
          kind: "permanent" | "avatar";
          at: CellKey;
          index?: number;
          seat?: ReturnType<typeof seatFromOwner>;
        } | null => {
          // Use caster as origin rather than the spell tile
          let ox = pending.tile.x;
          let oy = pending.tile.y;
          try {
            const c = pending.caster;
            if (c?.kind === "avatar") {
              const pos = get().avatars?.[c.seat]?.pos as
                | [number, number]
                | null;
              if (
                Array.isArray(pos) &&
                Number.isFinite(pos[0]) &&
                Number.isFinite(pos[1])
              ) {
                ox = Number(pos[0]);
                oy = Number(pos[1]);
              }
            } else if (c?.kind === "permanent" && typeof c.at === "string") {
              const [px, py] = c.at.split(",").map((v) => Number(v));
              if (Number.isFinite(px) && Number.isFinite(py)) {
                ox = px;
                oy = py;
              }
            }
          } catch {}
          const w = get().board.size.w;
          const h = get().board.size.h;
          const avatars = get().avatars;
          const permanents = get().permanents;
          const checkTile = (
            tx: number,
            ty: number
          ): {
            kind: "permanent" | "avatar";
            at: CellKey;
            index?: number;
            seat?: ReturnType<typeof seatFromOwner>;
          } | null => {
            const k = `${tx},${ty}` as CellKey;
            try {
              const list = permanents[k] || [];
              if (list.length > 0) {
                for (let i = list.length - 1; i >= 0; i--) {
                  const it = list[i];
                  if (it && !it.attachedTo) {
                    return { kind: "permanent", at: k, index: i };
                  }
                }
              }
            } catch {}
            try {
              const p1 = avatars?.p1?.pos as [number, number] | null;
              if (Array.isArray(p1) && p1[0] === tx && p1[1] === ty) {
                return { kind: "avatar", at: k, seat: "p1" };
              }
            } catch {}
            try {
              const p2 = avatars?.p2?.pos as [number, number] | null;
              if (Array.isArray(p2) && p2[0] === tx && p2[1] === ty) {
                return { kind: "avatar", at: k, seat: "p2" };
              }
            } catch {}
            return null;
          };
          const t = pending.target;
          let dir: "N" | "E" | "S" | "W" | null = null;
          if (t && t.kind === "projectile") dir = t.direction;
          if (!dir) return null;

          const scanFirstHit = (): {
            kind: "permanent" | "avatar";
            at: CellKey;
            index?: number;
            seat?: ReturnType<typeof seatFromOwner>;
          } | null => {
            if (dir === "N") {
              for (let yy = oy - 1; yy >= 0; yy--) {
                const hit = checkTile(ox, yy);
                if (hit) return hit;
              }
            } else if (dir === "E") {
              for (let xx = ox + 1; xx < w; xx++) {
                const hit = checkTile(xx, oy);
                if (hit) return hit;
              }
            } else if (dir === "S") {
              for (let yy = oy + 1; yy < h; yy++) {
                const hit = checkTile(ox, yy);
                if (hit) return hit;
              }
            } else if (dir === "W") {
              for (let xx = ox - 1; xx >= 0; xx--) {
                const hit = checkTile(xx, oy);
                if (hit) return hit;
              }
            }
            return null;
          };

          const first = scanFirstHit();
          if (!first) return null;

          if (t && t.kind === "projectile" && t.intended) {
            if (t.intended.kind === "permanent" && t.intended.at === first.at) {
              try {
                const list = permanents[first.at] || [];
                const idx = Number(t.intended.index);
                const it = list[idx];
                if (Number.isFinite(idx) && it && !it.attachedTo) {
                  return { kind: "permanent", at: first.at, index: idx };
                }
              } catch {}
            } else if (t.intended.kind === "avatar") {
              try {
                const pos = avatars?.[t.intended.seat]?.pos as
                  | [number, number]
                  | null;
                if (Array.isArray(pos)) {
                  const cell = `${pos[0]},${pos[1]}` as CellKey;
                  if (cell === first.at) {
                    return {
                      kind: "avatar",
                      at: cell,
                      seat: t.intended.seat as ReturnType<typeof seatFromOwner>,
                    };
                  }
                }
              } catch {}
            }
          }

          return first;
        };

        // Prepare effect messages if we recognize the spell
        const nameLc = nm.toLowerCase();
        const isMagicMissiles = nameLc.includes("magic missile");
        const isGrappleShot = nameLc.includes("grapple shot");
        const damageRecords: Array<
          | { kind: "permanent"; at: CellKey; index: number; amount: number }
          | {
              kind: "avatar";
              seat: ReturnType<typeof seatFromOwner>;
              amount: number;
            }
        > = [];

        if (isMagicMissiles || isGrappleShot) {
          void (async () => {
            const rules = await fetchRulesText(nm);
            const amount = parseDamageAmount(rules, 1);
            if (isMagicMissiles) {
              const tgt = pending.target;
              if (tgt?.kind === "permanent") {
                damageRecords.push({
                  kind: "permanent",
                  at: tgt.at,
                  index: Number(tgt.index),
                  amount,
                });
              } else if (tgt?.kind === "avatar") {
                damageRecords.push({ kind: "avatar", seat: tgt.seat, amount });
              }
            } else if (isGrappleShot) {
              const hit = computeProjectileFirstHit();
              if (hit) {
                if (hit.kind === "permanent" && typeof hit.index === "number") {
                  damageRecords.push({
                    kind: "permanent",
                    at: hit.at,
                    index: Number(hit.index),
                    amount,
                  });
                } else if (hit.kind === "avatar" && hit.seat) {
                  damageRecords.push({
                    kind: "avatar",
                    seat: hit.seat,
                    amount,
                  });
                }
              }
            }
            if (damageRecords.length > 0) {
              transport?.sendMessage?.({
                type: "magicDamage",
                damage: damageRecords,
              } as unknown as CustomMessage);
            }
          })();
        }

        transport.sendMessage({
          type: "magicResolve",
          id: pending.id,
          spell: pending.spell,
          tile: pending.tile,
          ts: Date.now(),
        } as unknown as CustomMessage);
        // If a summary was already sent at confirm/target stage, avoid duplicating here
        if (!pending.summaryText) {
          // Fetch rules text to include in the summary for both players
          void (async () => {
            let rulesText: string | null = null;
            try {
              const res = await fetch(
                `/api/cards/rules?name=${encodeURIComponent(nm)}`
              );
              if (res.ok) {
                const data = (await res.json()) as {
                  rulesText?: string | null;
                };
                rulesText = (data?.rulesText ?? null) as string | null;
              }
            } catch {}
            const txt = rulesText ?? "";
            try {
              transport?.sendMessage?.({
                type: "magicSummary",
                id: pending.id,
                text: txt,
              } as unknown as CustomMessage);
            } catch {}
          })();
        }
      } catch {}
    }
    set({ pendingMagic: null } as Partial<GameState> as GameState);
  },

  cancelMagic: () => {
    const pending = get().pendingMagic;
    if (!pending) return;
    try {
      get().movePermanentToZone(
        pending.spell.at as CellKey,
        Number(pending.spell.index),
        "hand"
      );
    } catch {}
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "magicCancel",
          id: pending.id,
          spell: pending.spell,
          tile: pending.tile,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
    set({ pendingMagic: null } as Partial<GameState> as GameState);
  },
});
