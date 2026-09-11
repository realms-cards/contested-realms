import type { StateCreator } from "zustand";
import { extractMagicTargetingHintsSync } from "@/lib/game/cardAbilities";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import { luckyCharmCount } from "@/lib/game/cpu/luckyCharm";
import { getSpellChoice, getSpellChoices, supportsSpell } from "@/lib/game/cpu/spells";
import { hasCustomResolver } from "@/lib/game/resolverRegistry";
import type { CustomMessage } from "@/lib/net/transport";
import type { CellKey, GameState, PlayerKey } from "./types";
import { getCellNumber, seatFromOwner } from "./utils/boardHelpers";

function newMagicId() {
  return `mag_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type MagicSlice = Pick<
  GameState,
  | "pendingMagic"
  | "setCpuMagicChoice"
  | "activateCpuAbility"
  | "chooseCpuTrigger"
  | "finishCpuEffect"
  | "completeCpuMagicManual"
  | "beginMagicCast"
  | "setMagicCasterChoice"
  | "setMagicTargetChoice"
  | "confirmMagic"
  | "resolveMagic"
  | "cancelMagic"
>;

export const createMagicSlice: StateCreator<GameState, [], [], MagicSlice> = (
  set,
  get,
) => ({
  pendingMagic: null,
  finishCpuEffect: ({pending,label,ability}) => {
    const instanceId = pending.spell.instanceId || pending.spell.card.instanceId;
    if (instanceId && !pending.cpuEvent && !ability) {
      for (const [cell,units] of Object.entries(get().permanents)) {
        const index = units.findIndex(unit => (unit.instanceId || unit.card.instanceId) === instanceId);
        if (index>=0) { get().movePermanentToZone(cell,index,"graveyard"); break; }
      }
    }
    const privateCpuChoice = pending.cpuEvent?.kind === "genesis" && seatFromOwner(pending.spell.owner) !== get().actorKey &&
      ["Observatory","Autumn River","Spring River","Summer River"].includes(pending.spell.card.name);
    get().log(`${pending.spell.card.name}: ${privateCpuChoice ? "resolved its private deck choice" : label}`);
    get().flushPendingPatches();
    get().transport?.sendMessage?.({type:"magicResolve",id:pending.id,spell:pending.spell,tile:pending.tile} as unknown as CustomMessage);
  },
  chooseCpuTrigger: (id) => {
    if (get().cpuTriggerOptions?.some(option => option.id === id)) set({cpuChosenTrigger:id});
  },
  activateCpuAbility: (key, requestedSeat, requestId) => {
    const state = get(), seat = requestedSeat || state.actorKey;
    if (!state.opponentPlayerId?.startsWith("cpu_") || !seat) return;
    if (requestId && state.cpuAbilityReceipts?.includes(requestId)) {
      if (state.pendingMagic?.id === requestId || state.cpuEffectContinuations?.some(frame => frame.completion?.pending.id === requestId)) return;
      state.transport?.sendMessage?.({type:"magicResolve",id:requestId} as unknown as CustomMessage);
      return;
    }
    if (requestId) set({cpuAbilityReceipts:[...(state.cpuAbilityReceipts || []).slice(-99),requestId]});
    const choice = state.matchEnded ? undefined : abilityChoices(state,seat).find(choice => choice.key === key);
    const id = requestId || newMagicId();
    if (choice) {
      const source = choice.source, [x,y] = source.at.split(",").map(Number);
      // Hold the normal resolution lock while paying costs and applying effects.
      const spell = {at:source.at,index:-1,owner:seat === "p1" ? 1 as const : 2 as const,instanceId:id,card:source.card};
      set({pendingMagic:{id,tile:{x,y},spell,status:"confirm",createdAt:Date.now()}});
      state.transport?.sendMessage?.({type:"magicBegin",id,tile:{x,y},spell} as unknown as CustomMessage);
      const pending = get().pendingMagic;
      if (!pending) return;
      const complete = applySpellChoice(set,get,choice,Math.random,{pending,label:choice.label,ability:true});
      set({pendingMagic:null});
      if (complete) get().finishCpuEffect({pending,label:choice.label,ability:true});
      return;
    }
    // Also release the bot's request lock when a stale choice is rejected.
    state.transport?.sendMessage?.({type:"magicResolve",id} as unknown as CustomMessage);
  },

  completeCpuMagicManual: () => {
    const state = get(), pending = state.pendingMagic;
    if (!state.opponentPlayerId?.startsWith("cpu_") || !pending ||
        state.actorKey !== seatFromOwner(pending.spell.owner) || supportsSpell(pending.spell.card.name || "")) return;
    set({ pendingMagic: null });
    const instanceId = pending.spell.instanceId || pending.spell.card.instanceId;
    if (instanceId && pending.spell.card.type === "Magic") {
      for (const [at,units] of Object.entries(get().permanents)) {
        const index = units.findIndex(unit => (unit.instanceId || unit.card.instanceId) === instanceId);
        if (index >= 0) { get().movePermanentToZone(at,index,"graveyard"); break; }
      }
    }
    get().log(`${pending.spell.card.name}: effect resolved manually.`);
    get().transport?.sendMessage?.({ type: "magicResolve", id: pending.id, spell: pending.spell, tile: pending.tile } as unknown as CustomMessage);
    get().checkMatchEnd();
  },

  setCpuMagicChoice: (key) => {
    const state = get();
    const pending = state.pendingMagic;
    if (!pending || !state.opponentPlayerId?.startsWith("cpu_") ||
        state.actorKey !== seatFromOwner(pending.spell.owner)) return;
    const choice = getSpellChoice(state, seatFromOwner(pending.spell.owner), pending.spell.card.name || "", key);
    if (!choice) return;
    set({ pendingMagic: { ...pending, cpuChoice: key, caster: choice.caster, target: choice.target, status: "choosingTarget" } });
    state.transport?.sendMessage?.({ type: "cpuMagicChoice", id: pending.id, key } as unknown as CustomMessage);
  },

  beginMagicCast: (input) => {
    const id = newMagicId();
    const spell = input.spell;
    const tile = input.tile;
    const createdAt = Date.now();
    const magicGuidesActive = get().magicGuidesActive || get().opponentPlayerId?.startsWith("cpu_");
    const ownerSeat = seatFromOwner(spell.owner);
    // The player picks who casts (avatar or a Spellcaster minion) unless the
    // caller already knows (e.g. an ability cast from a specific minion).
    const presetCaster = input.presetCaster ?? null;

    // When magic guides are disabled, skip the targeting flow entirely
    // to prevent pendingMagic from blocking board interactions
    if (!magicGuidesActive) {
      // Just show a toast for feedback, but don't enter the targeting flow
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          const cardName = spell.card?.name || "Magic";
          const cellNo = getCellNumber(tile.x, tile.y, get().board.size.w, get().board.size.h);
          const playerNum = ownerSeat === "p1" ? "1" : "2";
          transport.sendMessage({
            type: "toast",
            text: `[p${playerNum}:PLAYER] played [p${playerNum}card:${cardName}] at #${cellNo}`,
            seat: ownerSeat,
          } as unknown as CustomMessage);
        } catch {}
      }
      return;
    }

    // Targeting intention (projectile / site / single / area / none) comes from
    // the rules text. Cards enriched at deck load carry it as `card.text`;
    // otherwise the fetch below refines the hints once the text arrives.
    const hints = extractMagicTargetingHintsSync(
      spell.card?.name || "",
      spell.card?.text ?? null,
    );
    // Guides only show when both players have opted in (magicGuidesActive).

    // Suppress guides for cards with custom resolvers - they have their own UI
    const cardHasResolver = hasCustomResolver(spell.card?.name);

    set({
      pendingMagic: {
        id,
        tile,
        spell,
        caster: presetCaster,
        target: null,
        status: presetCaster ? "choosingTarget" : "choosingCaster",
        hints,
        createdAt,
        guidesSuppressed: cardHasResolver,
      },
    } as Partial<GameState> as GameState);
    // Prefetch rules text early to avoid delay later
    try {
      const cardName = spell.card?.name || "";
      if (cardName) {
        void (async () => {
          try {
            const res = await fetch(
              `/api/cards/rules?name=${encodeURIComponent(cardName)}`,
            );
            if (!res.ok) return;
            const data = (await res.json()) as { rulesText?: string | null };
            const rulesText = (data?.rulesText ?? null) as string | null;
            set((s) => {
              if (!s.pendingMagic || s.pendingMagic.id !== id)
                return s as GameState;
              const nextHints =
                !s.pendingMagic.hints?.fromText && rulesText
                  ? extractMagicTargetingHintsSync(cardName, rulesText)
                  : s.pendingMagic.hints;
              return {
                pendingMagic: {
                  ...s.pendingMagic,
                  summaryText: rulesText,
                  hints: nextHints,
                },
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
        const cellNo = getCellNumber(tile.x, tile.y, get().board.size.w, get().board.size.h);
        transport.sendMessage({
          type: "toast",
          text: `Casting '${cardName}' at #${cellNo}`,
        } as unknown as CustomMessage);
        if (presetCaster) {
          transport.sendMessage({
            type: "magicSetCaster",
            id,
            caster: presetCaster,
            ts: Date.now(),
          } as unknown as CustomMessage);
        }
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

    // In CPU matches the bot has no client to click "Resolve",
    // so auto-resolve after a brief delay when the human casts a spell.
    try {
      const oppId = get().opponentPlayerId;
      if (typeof oppId === "string" && oppId.startsWith("cpu_")) {
        const pendingId = get().pendingMagic?.id;
        setTimeout(() => {
          const s = get();
          if (s.pendingMagic && s.pendingMagic.id === pendingId && s.pendingMagic.status === "confirm") {
            s.resolveMagic();
          }
        }, 1200);
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
              `/api/cards/rules?name=${encodeURIComponent(nm)}`,
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
    if (get().opponentPlayerId?.startsWith("cpu_") && !pending.cpuEvent && !supportsSpell(pending.spell.card.name || "")) {
      get().log("This effect requires manual resolution. Confirm completion in the CPU guide when finished.");
      return;
    }
    if (get().opponentPlayerId?.startsWith("cpu_") && (pending.cpuEvent || supportsSpell(pending.spell.card.name || ""))) {
      const choice = getSpellChoice(get(), seatFromOwner(pending.spell.owner), pending.spell.card.name || "", pending.cpuChoice);
      if (!choice) {
        set({ pendingMagic: { ...pending, status: "choosingTarget" } });
        get().log("Choose a legal spell effect before resolving.");
        return;
      }
      if (choice.operations.some(op => op.kind === "raise" && !op.to)) {
        const eligible = (["p1","p2"] as PlayerKey[]).flatMap(fromSeat => get().zones[fromSeat].graveyard
          .map((card,graveyardIndex) => ({card,fromSeat,graveyardIndex})).filter(item => item.card.type === "Minion"));
        if (eligible.length) {
          const seat = seatFromOwner(pending.spell.owner);
          const options = Array.from({length:1+luckyCharmCount(get(),seat)},() => eligible[Math.floor(Math.random()*eligible.length)]);
          const cpuRandomMinion = options[0];
          set({pendingMagic:{...pending,cpuRandomMinion,cpuRandomMinionOptions:options.length>1 ? options : undefined,cpuChoice:undefined,status:"choosingTarget"}});
          get().log(options.length>1 ? `Lucky Charm revealed ${options.map(option => option.card.name).join(" or ")}. Choose a result and where to summon it.` : `Raise Dead selected ${cpuRandomMinion.card.name}. Choose where to summon it.`);
          if (get().actorKey !== seat) {
            const summon = getSpellChoices(get(),seat,"Raise Dead").sort((a,b) => b.score-a.score)[0];
            const current = get().pendingMagic;
            if (summon && current) {
              set({pendingMagic:{...current,cpuChoice:summon.key,status:"confirm"}});
              get().resolveMagic();
            }
          }
          return;
        }
      }
      // Claim resolution before applying effects; incoming echoes cannot replay it.
      set({ pendingMagic: null });
      if (applySpellChoice(set,get,choice,Math.random,{pending,label:choice.label})) get().finishCpuEffect({pending,label:choice.label});
      return;
    }
    const at = pending.spell.at as CellKey;
    const index = Number(pending.spell.index);

    // Per Sorcery Rulebook (p.749-751): Only Magic spells go to cemetery after resolution.
    // Auras (p.743-746), Artifacts/Monuments (p.739-277), and Minions (p.725-729)
    // remain in play as permanents.
    const spellType = (pending.spell.card?.type || "").toLowerCase();
    const isInstantMagic = spellType.includes("magic");

    if (isInstantMagic) {
      try {
        get().movePermanentToZone(at, index, "graveyard");
      } catch {}
    }
    // Non-magic spells (Auras, Artifacts, Minions) stay on the board as permanents
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        const nm = pending.spell.card?.name || "Magic";
        // Heuristic: fetch rules to extract intended damage amount (first integer in text)
        const fetchRulesText = async (name: string): Promise<string | null> => {
          try {
            const res = await fetch(
              `/api/cards/rules?name=${encodeURIComponent(name)}`,
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
          fallback = 1,
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
            ty: number,
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
                `/api/cards/rules?name=${encodeURIComponent(nm)}`,
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
    if (get().pendingMagic?.cpuRandomMinion || get().pendingMagic?.cpuEvent) {
      get().log("This effect has already begun resolving. Finish its remaining choices.");
      return;
    }
    const pending = get().pendingMagic;
    if (!pending) return;
    try {
      get().movePermanentToZone(
        pending.spell.at as CellKey,
        Number(pending.spell.index),
        "hand",
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
