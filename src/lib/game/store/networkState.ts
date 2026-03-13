import type { StateCreator } from "zustand";
import { soundManager } from "@/lib/audio/soundManager";
import type {
  AvatarState,
  CardRef,
  GameState,
  Permanents,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import type { PlayerPositionReference } from "../types";
import { createInitialPlayers } from "./coreState";
import { filterEchoPatchIfAny } from "./transportState";
import { normalizeAvatars } from "./utils/avatarHelpers";
import { seatFromOwner } from "./utils/boardHelpers";
import { mergeEvents } from "./utils/eventHelpers";
import {
  deepMergeReplaceArrays,
  mergePermanentsMap,
} from "./utils/patchHelpers";
import { normalizePermanentsRecord } from "./utils/permanentHelpers";
import {
  createDefaultPlayerPositions,
  normalizePlayerPositions,
} from "./utils/positionHelpers";
// snapshot lifecycle is managed by clearSnapshotsForNewMatch in store.ts
import { normalizeZones } from "./utils/zoneHelpers";

type NetworkSlice = Pick<
  GameState,
  "lastServerTs" | "lastLocalActionTs" | "applyServerPatch" | "applyPatch"
>;

export const createNetworkSlice: StateCreator<
  GameState,
  [],
  [],
  NetworkSlice
> = (set, get) => ({
  lastServerTs: 0,
  lastLocalActionTs: 0,

  applyServerPatch: (patch, t) =>
    set((state) => {
      if (!patch || typeof patch !== "object") return state as GameState;
      if (typeof t === "number" && t < (state.lastServerTs ?? 0)) {
        return state as GameState;
      }

      let incoming = patch as ServerPatchT;
      const replaceKeysCandidateInitial = Array.isArray(incoming.__replaceKeys)
        ? incoming.__replaceKeys
        : null;
      if (
        !replaceKeysCandidateInitial ||
        replaceKeysCandidateInitial.length === 0
      ) {
        const echoResult = filterEchoPatchIfAny(incoming);
        if (echoResult.matched) {
          if (!echoResult.patch) {
            if (typeof t === "number") {
              const lastTsEcho = Math.max(state.lastServerTs ?? 0, t);
              if (lastTsEcho !== (state.lastServerTs ?? 0)) {
                return {
                  ...state,
                  lastServerTs: lastTsEcho,
                } as GameState;
              }
            }
            return state as GameState;
          }
          incoming = echoResult.patch;
        }
      }

      const p = incoming as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : [],
      );
      if (replaceKeys.size > 0) {
        try {
          console.debug("[net] applyServerPatch: authoritative snapshot", {
            keys: Array.from(replaceKeys),
            t: typeof t === "number" ? t : null,
            prevTs: state.lastServerTs ?? 0,
          });
          if (
            replaceKeys.has("permanents") ||
            replaceKeys.has("zones") ||
            replaceKeys.has("board")
          ) {
            const prevPerCount = Object.values(state.permanents || {}).reduce(
              (a, v) => a + (Array.isArray(v) ? v.length : 0),
              0,
            );
            const prevSiteCount =
              state.board && state.board.sites
                ? Object.keys(state.board.sites).length
                : 0;
            const prevHandP1 = state.zones?.p1?.hand?.length ?? 0;
            const prevHandP2 = state.zones?.p2?.hand?.length ?? 0;
            console.debug("[net] snapshot(prev)", {
              per: prevPerCount,
              sites: prevSiteCount,
              handP1: prevHandP1,
              handP2: prevHandP2,
            });
            const pPer = p.permanents
              ? Object.values(p.permanents as Record<string, unknown[]>).reduce(
                  (a, v) => a + (Array.isArray(v) ? v.length : 0),
                  0,
                )
              : undefined;
            const pBoard = p.board as GameState["board"] | undefined;
            const pZones = p.zones as GameState["zones"] | undefined;
            const pSites = pBoard?.sites
              ? Object.keys(pBoard.sites).length
              : undefined;
            const pHandP1 = pZones?.p1?.hand?.length;
            const pHandP2 = pZones?.p2?.hand?.length;
            console.debug("[net] snapshot(patch)", {
              per: pPer,
              sites: pSites,
              handP1: pHandP1,
              handP2: pHandP2,
            });
          }
        } catch {}
      }
      // NOTE: Snapshot clearing was previously done here on every patch with
      // __replaceKeys for players/board/zones/avatars/permanents, but this was
      // far too aggressive — it wiped snapshots on every resync and most normal
      // patches. Snapshot lifecycle is now managed by clearSnapshotsForNewMatch
      // (called explicitly when starting a truly new match) and the retention
      // logic inside createSnapshot.

      if (p.players !== undefined) {
        // DEBUG: Log mana values before and after merge to track accumulation bug
        if (process.env.NODE_ENV !== "production") {
          try {
            const patchPlayers = p.players as Record<string, { mana?: number }>;
            console.log("[applyServerPatch] players patch:", {
              isReplace: replaceKeys.has("players"),
              stateManaP1: state.players?.p1?.mana,
              stateManaP2: state.players?.p2?.mana,
              patchManaP1: patchPlayers?.p1?.mana,
              patchManaP2: patchPlayers?.p2?.mana,
            });
          } catch {}
        }
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : (deepMergeReplaceArrays(
              state.players,
              p.players,
            ) as GameState["players"]);
        // DEBUG: Log result
        if (process.env.NODE_ENV !== "production") {
          try {
            console.log("[applyServerPatch] players result:", {
              resultManaP1: next.players?.p1?.mana,
              resultManaP2: next.players?.p2?.mana,
            });
          } catch {}
        }

        // Play health sounds for life changes from incoming patches
        // This ensures both players hear sounds when either player's life changes
        for (const seat of ["p1", "p2"] as const) {
          const oldLife = state.players?.[seat]?.life ?? 20;
          const newLife = next.players?.[seat]?.life ?? 20;
          if (newLife !== oldLife) {
            const delta = newLife - oldLife;
            if (delta > 0) {
              soundManager.play("healthPlus");
            } else {
              soundManager.play("healthMinus");
            }
          }
        }
      } else if (replaceKeys.has("players")) {
        // Server snapshot requested players replacement but didn't include players data
        // Reset to initial state to ensure consistent mana tracking
        next.players = createInitialPlayers();
        if (process.env.NODE_ENV !== "production") {
          try {
            console.log(
              "[applyServerPatch] players reset to initial (replaceKeys had players but patch did not)",
            );
          } catch {}
        }
      }

      // Track if the turn is changing (for end-of-turn triggers like Lilith)
      const prevCurrentPlayer = state.currentPlayer;
      const turnChanging =
        p.currentPlayer !== undefined && p.currentPlayer !== prevCurrentPlayer;

      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }

      // If the turn is changing in online play, trigger turn-based effects
      // Each effect has internal guards to only fire on the owner's client
      if (turnChanging && prevCurrentPlayer !== undefined) {
        const endingPlayerSeat = (
          prevCurrentPlayer === 1 ? "p1" : "p2"
        ) as PlayerKey;
        const startingPlayerSeat = (
          endingPlayerSeat === "p1" ? "p2" : "p1"
        ) as PlayerKey;
        const actorKey = get().actorKey;
        if (process.env.NODE_ENV !== "production") {
          console.log(
            "[applyServerPatch] Turn changing:",
            endingPlayerSeat,
            "->",
            startingPlayerSeat,
            "(we are",
            actorKey,
            ")",
          );
        }

        // End-of-turn effects (Lilith) - only trigger if WE are the ending player
        // The Lilith trigger has its own guard but we can skip the call entirely
        if (actorKey === endingPlayerSeat) {
          setTimeout(() => {
            try {
              get().triggerLilithEndOfTurn(endingPlayerSeat);
            } catch (e) {
              console.error("[applyServerPatch] Error triggering Lilith:", e);
            }
          }, 0);
        }

        // Revert Assimilator Snail transformations at start of owner's turn
        // The starting player's snails should revert - trigger on the owner's client
        if (actorKey === startingPlayerSeat) {
          setTimeout(() => {
            try {
              get().revertAssimilatorSnailTransforms(startingPlayerSeat);
            } catch (e) {
              console.error(
                "[applyServerPatch] Error reverting Assimilator Snail:",
                e,
              );
            }
          }, 0);
        }

        // Start-of-turn effects (Mother Nature) - only trigger if WE are the starting player
        // The Mother Nature trigger has its own guard but we can skip the call entirely
        if (actorKey === startingPlayerSeat) {
          // Delay to ensure turn state is fully updated and any end-of-turn UI clears
          setTimeout(() => {
            try {
              get().triggerMotherNatureStartOfTurn(startingPlayerSeat);
            } catch (e) {
              console.error(
                "[applyServerPatch] Error triggering Mother Nature:",
                e,
              );
            }
          }, 500);

          // Headless Haunt start-of-turn movement (slightly delayed after Mother Nature)
          // Only trigger if we ARE the starting player (the one whose haunts should move)
          // The coreState.endTurn() triggers for the OTHER player, so we need this for online sync
          setTimeout(() => {
            try {
              get().triggerHeadlessHauntStartOfTurn(startingPlayerSeat);
            } catch (e) {
              console.error(
                "[applyServerPatch] Error triggering Headless Haunt:",
                e,
              );
            }
          }, 700);
        }
      }

      if (p.d20Rolls !== undefined) {
        next.d20Rolls = replaceKeys.has("d20Rolls")
          ? p.d20Rolls
          : (deepMergeReplaceArrays(
              state.d20Rolls,
              p.d20Rolls,
            ) as GameState["d20Rolls"]);
        if (process.env.NODE_ENV !== "production") {
          try {
            console.log("[applyServerPatch] Applied d20Rolls:", {
              prev: state.d20Rolls,
              new: next.d20Rolls,
              isReplace: replaceKeys.has("d20Rolls"),
            });
          } catch {}
        }
      }
      const patchHasSetupWinner =
        p.setupWinner !== undefined ||
        Object.prototype.hasOwnProperty.call(p, "setupWinner");
      if (p.setupWinner !== undefined) {
        next.setupWinner = p.setupWinner;
      }
      if (!patchHasSetupWinner) {
        const derivedFromD20 = (() => {
          const source = (next.d20Rolls ?? state.d20Rolls) as
            | Record<PlayerKey, number | null>
            | undefined;
          if (!source) return null;
          // Only derive winner if BOTH players have actually rolled (non-null values)
          if (source.p1 == null || source.p2 == null) {
            return null;
          }
          const p1 = Number(source.p1);
          const p2 = Number(source.p2);
          if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
          if (p1 === p2) return null;
          return p1 > p2 ? ("p1" as PlayerKey) : ("p2" as PlayerKey);
        })();
        if (derivedFromD20) {
          next.setupWinner = derivedFromD20;
        }
      }
      if (p.matchEnded !== undefined) {
        next.matchEnded = p.matchEnded;
      }
      if (p.winner !== undefined) {
        next.winner = p.winner;
      }
      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? (p.board as GameState["board"])
          : (deepMergeReplaceArrays(
              state.board,
              p.board,
            ) as GameState["board"]);
      }
      if (p.zones !== undefined) {
        // DEBUG: Log zone patch details
        try {
          const pZones = p.zones as Record<
            string,
            { hand?: unknown[]; graveyard?: unknown[]; banished?: unknown[] }
          >;
          if (process.env.NODE_ENV !== "production")
            console.log("[net] zones patch received", {
              patchKeys: Object.keys(pZones || {}),
              hasP1: !!pZones?.p1,
              hasP2: !!pZones?.p2,
              patchP1Hand: pZones?.p1?.hand?.length,
              patchP2Hand: pZones?.p2?.hand?.length,
              patchP1Graveyard: pZones?.p1?.graveyard?.length,
              patchP2Graveyard: pZones?.p2?.graveyard?.length,
              patchP1Banished: (pZones?.p1 as { banished?: unknown[] })
                ?.banished?.length,
              patchP2Banished: (pZones?.p2 as { banished?: unknown[] })
                ?.banished?.length,
              replaceZones: replaceKeys.has("zones"),
              stateP1Hand: state.zones?.p1?.hand?.length,
              stateP2Hand: state.zones?.p2?.hand?.length,
              stateP1Graveyard: state.zones?.p1?.graveyard?.length,
              stateP2Graveyard: state.zones?.p2?.graveyard?.length,
            });
        } catch {}
        // When a zones patch includes data for a seat, replace that seat's
        // zones wholesale instead of deep-merging individual zone arrays.
        // createZonesPatchFor always sends ALL zone arrays for a seat, so
        // seat-level replacement is safe and prevents stale data from surviving
        // (e.g., a card remaining in the graveyard after being drawn to hand).
        // In CPU matches the server is fully authoritative over the
        // CPU player's zones — there is no second client hiding data.
        // Determine which seat (if any) belongs to the CPU so we can
        // skip the empty-array filter for that seat.
        const oppId = state.opponentPlayerId;
        const isCpuMatch = typeof oppId === "string" && oppId.startsWith("cpu_");
        const cpuSeat: PlayerKey | null = isCpuMatch
          ? (state.actorKey === "p1" ? "p2" : "p1")
          : null;

        let zonesCandidate: Partial<
          Record<PlayerKey, GameState["zones"][PlayerKey]>
        >;
        {
          // Both full replacement (__replaceKeys includes "zones") and
          // incremental patches go through the same safe merge: we never
          // overwrite a populated zone array with an empty one, because
          // the server/opponent does not have access to hidden zones
          // (opponent's hand, atlas, spellbook, etc.).
          const patchZones = p.zones as Partial<
            Record<PlayerKey, GameState["zones"][PlayerKey]>
          >;
          const merged = (
            replaceKeys.has("zones")
              ? { ...(p.zones as GameState["zones"]) }
              : { ...state.zones }
          ) as Record<PlayerKey, GameState["zones"][PlayerKey]>;

          for (const seat of ["p1", "p2"] as PlayerKey[]) {
            const patchSeat = patchZones[seat] as Record<string, unknown> | undefined;
            if (!patchSeat || typeof patchSeat !== "object") continue;

            const stateSeat = state.zones[seat] as Record<string, unknown> | undefined;
            if (!stateSeat) continue; // No local data to protect

            const safePatch: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(patchSeat)) {
              // Skip empty arrays when state has data — the sender likely
              // doesn't have access to this zone (hidden opponent data).
              // Exception: in CPU matches the server controls the CPU's
              // zones, so empty arrays are intentional clearances.
              if (
                seat !== cpuSeat &&
                Array.isArray(val) &&
                val.length === 0 &&
                Array.isArray(stateSeat[key]) &&
                (stateSeat[key] as unknown[]).length > 0
              ) {
                continue;
              }
              safePatch[key] = val;
            }
            merged[seat] = {
              ...merged[seat],
              ...safePatch,
            } as GameState["zones"][PlayerKey];
          }
          zonesCandidate = merged;
        }

        // CRITICAL: Filter out stolen cards from incoming zones patches
        // Server doesn't know about pithImpHands, so it may re-add stolen cards during turn transitions
        // EXCEPT: Don't filter cards that are being returned (tracked in processedPithImpReturns)
        // IMPORTANT: Use instanceId (unique per card) to avoid filtering duplicate copies
        const pithImpHands = state.pithImpHands || [];
        const processedReturns =
          state.processedPithImpReturns || new Set<string>();
        if (pithImpHands.length > 0 && zonesCandidate) {
          const stolenInstanceIds = new Set<string>();
          for (const pithImpEntry of pithImpHands) {
            // Skip entries that are being returned (race condition: set() hasn't flushed yet)
            if (!processedReturns.has(pithImpEntry.id)) {
              for (const card of pithImpEntry.hand) {
                if (card.instanceId) {
                  stolenInstanceIds.add(card.instanceId);
                }
              }
            }
          }
          if (stolenInstanceIds.size > 0) {
            const filteredZones = { ...zonesCandidate } as Record<
              PlayerKey,
              GameState["zones"][PlayerKey]
            >;
            for (const seat of ["p1", "p2"] as PlayerKey[]) {
              const seatZones = filteredZones[seat];
              if (seatZones && Array.isArray(seatZones.hand)) {
                filteredZones[seat] = {
                  ...seatZones,
                  hand: seatZones.hand.filter(
                    (c) =>
                      !c.instanceId || !stolenInstanceIds.has(c.instanceId),
                  ),
                };
              }
            }
            zonesCandidate = filteredZones;
          }
        }

        // CRITICAL: Filter out Morgana private hand cards from incoming spellbook patches
        // Server doesn't know about morganaHands, so it may re-add drawn cards during turn transitions
        // IMPORTANT: Use instanceId (unique per card) to avoid filtering duplicate copies
        const morganaHands = state.morganaHands || [];
        if (morganaHands.length > 0 && zonesCandidate) {
          const morganaInstanceIdsBySeat: Record<PlayerKey, Set<string>> = {
            p1: new Set(),
            p2: new Set(),
          };
          for (const morganaEntry of morganaHands) {
            for (const card of morganaEntry.hand) {
              if (card.instanceId) {
                morganaInstanceIdsBySeat[morganaEntry.ownerSeat].add(
                  card.instanceId,
                );
              }
            }
          }
          const filteredZones = { ...zonesCandidate } as Record<
            PlayerKey,
            GameState["zones"][PlayerKey]
          >;
          for (const seat of ["p1", "p2"] as PlayerKey[]) {
            const instanceIds = morganaInstanceIdsBySeat[seat];
            if (instanceIds.size > 0) {
              const seatZones = filteredZones[seat];
              if (seatZones && Array.isArray(seatZones.spellbook)) {
                filteredZones[seat] = {
                  ...seatZones,
                  spellbook: seatZones.spellbook.filter(
                    (c) => !c.instanceId || !instanceIds.has(c.instanceId),
                  ),
                };
              }
            }
          }
          zonesCandidate = filteredZones;
        }

        // CRITICAL: Filter out Omphalos private hand cards from incoming spellbook patches
        // Server doesn't know about omphalosHands, so it may re-add drawn cards during turn transitions
        // IMPORTANT: Use instanceId (unique per card) to avoid filtering duplicate copies
        const omphalosHands = state.omphalosHands || [];
        if (omphalosHands.length > 0 && zonesCandidate) {
          const omphalosInstanceIdsBySeat: Record<PlayerKey, Set<string>> = {
            p1: new Set(),
            p2: new Set(),
          };
          for (const omphalosEntry of omphalosHands) {
            for (const card of omphalosEntry.hand) {
              if (card.instanceId) {
                omphalosInstanceIdsBySeat[omphalosEntry.ownerSeat].add(
                  card.instanceId,
                );
              }
            }
          }
          const filteredZones = { ...zonesCandidate } as Record<
            PlayerKey,
            GameState["zones"][PlayerKey]
          >;
          for (const seat of ["p1", "p2"] as PlayerKey[]) {
            const instanceIds = omphalosInstanceIdsBySeat[seat];
            if (instanceIds.size > 0) {
              const seatZones = filteredZones[seat];
              if (seatZones && Array.isArray(seatZones.spellbook)) {
                filteredZones[seat] = {
                  ...seatZones,
                  spellbook: seatZones.spellbook.filter(
                    (c) => !c.instanceId || !instanceIds.has(c.instanceId),
                  ),
                };
              }
            }
          }
          zonesCandidate = filteredZones;
        }

        // CRITICAL: Filter out Searing Truth drawn cards from incoming spellbook patches
        // and ensure they're in the target's hand. Server doesn't know about local Searing Truth state.
        const pendingSearingTruth = state.pendingSearingTruth;
        // Filter whenever we have revealed cards, regardless of phase
        // (the pendingSearingTruth is kept for a few seconds after resolve to protect zones)
        if (
          pendingSearingTruth &&
          pendingSearingTruth.targetSeat &&
          pendingSearingTruth.revealedCards.length > 0 &&
          zonesCandidate
        ) {
          if (process.env.NODE_ENV !== "production")
            console.log(
              "[SearingTruth] Filter ACTIVE - filtering cards from spellbook",
            );
          const targetSeat = pendingSearingTruth.targetSeat;
          // Track counts instead of using Set to handle duplicate cardIds
          const revealedCardCounts = new Map<number, number>();
          for (const c of pendingSearingTruth.revealedCards) {
            revealedCardCounts.set(
              c.cardId,
              (revealedCardCounts.get(c.cardId) || 0) + 1,
            );
          }
          if (process.env.NODE_ENV !== "production")
            console.log(
              "[SearingTruth] Filter cardIds:",
              Array.from(revealedCardCounts.entries()),
            );
          const filteredZones = { ...zonesCandidate } as Record<
            PlayerKey,
            GameState["zones"][PlayerKey]
          >;
          const seatZones = filteredZones[targetSeat];
          if (seatZones) {
            // Filter revealed cards from spellbook
            if (Array.isArray(seatZones.spellbook)) {
              if (process.env.NODE_ENV !== "production")
                console.log(
                  "[SearingTruth] Spellbook BEFORE filter:",
                  seatZones.spellbook.length,
                );
              const movedCards: CardRef[] = [];
              const updatedSpellbook = seatZones.spellbook.filter((c) => {
                const remaining = revealedCardCounts.get(c.cardId) || 0;
                if (
                  remaining > 0 &&
                  movedCards.length < pendingSearingTruth.revealedCards.length
                ) {
                  movedCards.push(c);
                  revealedCardCounts.set(c.cardId, remaining - 1);
                  return false;
                }
                return true;
              });

              if (process.env.NODE_ENV !== "production")
                console.log(
                  "[SearingTruth] Spellbook AFTER filter:",
                  updatedSpellbook.length,
                  "movedCards:",
                  movedCards.length,
                );

              // Ensure revealed cards are in hand (add if not present)
              const currentHand = [...(seatZones.hand || [])];
              const handCardIds = new Set(currentHand.map((c) => c.cardId));
              for (const card of movedCards) {
                if (!handCardIds.has(card.cardId)) {
                  currentHand.push(card);
                }
              }
              if (process.env.NODE_ENV !== "production")
                console.log(
                  "[SearingTruth] Hand AFTER filter:",
                  currentHand.length,
                );

              filteredZones[targetSeat] = {
                ...seatZones,
                spellbook: updatedSpellbook,
                hand: currentHand,
              };
            }
          }
          zonesCandidate = filteredZones;
        }

        // CRITICAL: Filter out cards from hand that are already on the board (as permanents)
        // This prevents duplication when server has stale zone data after card was played
        // IMPORTANT: Use instanceId (unique per card copy) NOT cardId (shared between copies)
        if (zonesCandidate) {
          // Collect all instanceIds that are currently on the board as permanents
          const permanentsSource =
            p.permanents !== undefined
              ? replaceKeys.has("permanents")
                ? (p.permanents as Permanents)
                : mergePermanentsMap(state.permanents, p.permanents)
              : state.permanents;
          const onBoardInstanceIds = new Set<string>();
          for (const cellPermanents of Object.values(permanentsSource || {})) {
            for (const perm of cellPermanents || []) {
              // Use instanceId if available, otherwise card.instanceId
              const instId = perm?.instanceId || perm?.card?.instanceId;
              if (instId && typeof instId === "string") {
                onBoardInstanceIds.add(instId);
              }
            }
          }
          // Also include cards on sites (use instanceId)
          const sitesSource = p.board?.sites ?? state.board?.sites;
          for (const site of Object.values(sitesSource || {})) {
            const instId = site?.card?.instanceId;
            if (instId && typeof instId === "string") {
              onBoardInstanceIds.add(instId);
            }
          }
          if (onBoardInstanceIds.size > 0) {
            const filteredZones = { ...zonesCandidate } as Record<
              PlayerKey,
              GameState["zones"][PlayerKey]
            >;
            for (const seat of ["p1", "p2"] as PlayerKey[]) {
              const seatZones = filteredZones[seat];
              if (seatZones && Array.isArray(seatZones.hand)) {
                const originalCount = seatZones.hand.length;
                const filteredHand = seatZones.hand.filter(
                  (c) => !c.instanceId || !onBoardInstanceIds.has(c.instanceId),
                );
                if (filteredHand.length !== originalCount) {
                  if (process.env.NODE_ENV !== "production")
                    console.log(
                      "[applyServerPatch] Filtered cards from hand that are on board:",
                      {
                        seat,
                        originalCount,
                        filteredCount: filteredHand.length,
                        removedCount: originalCount - filteredHand.length,
                      },
                    );
                  filteredZones[seat] = {
                    ...seatZones,
                    hand: filteredHand,
                  };
                }
              }
            }
            zonesCandidate = filteredZones;
          }
        }

        // HARDENING: Post-filter sanity check - restore zones if filtering removed too many cards
        // This prevents catastrophic data loss from buggy filter logic
        try {
          const candidateZones = zonesCandidate as Record<
            PlayerKey,
            Partial<Zones>
          > | null;
          for (const seat of ["p1", "p2"] as PlayerKey[]) {
            const stateZones = state.zones?.[seat];
            const candidateSeatZones = candidateZones?.[seat];
            for (const zoneName of [
              "spellbook",
              "atlas",
              "hand",
            ] as (keyof Zones)[]) {
              const stateArr = stateZones?.[zoneName] as CardRef[] | undefined;
              const candidateArr = candidateSeatZones?.[zoneName] as
                | CardRef[]
                | undefined;
              const stateCount = stateArr?.length ?? 0;
              const candidateCount = Array.isArray(candidateArr)
                ? candidateArr.length
                : stateCount;
              // If filtering removed >80% of cards from a critical zone, restore from state
              // This is a safety valve for buggy filter logic
              if (
                stateCount > 5 &&
                candidateCount === 0 &&
                Array.isArray(candidateArr)
              ) {
                // Expected for authoritative snapshots where server hides
                // opponent zone data — log at debug level, not error.
                if (replaceKeys.size > 0) {
                  console.debug(
                    `[ZONE_RESTORE] ${seat}.${zoneName}: server snapshot had empty zone (${stateCount} cards preserved)`,
                  );
                } else {
                  console.warn(
                    `[FILTER_CATASTROPHE] ${seat}.${zoneName}: filtering wiped ${stateCount} cards to 0! Restoring.`,
                  );
                }
                if (candidateZones && candidateSeatZones) {
                  (candidateSeatZones as Record<string, CardRef[]>)[zoneName] =
                    stateArr ?? [];
                }
              }
            }
          }
          zonesCandidate = candidateZones as GameState["zones"];
        } catch (e) {
          console.error("[FILTER_SANITY_CHECK] Error:", e);
        }

        // HARDENING: Prevent accidental pile wipes
        // If a patch would replace spellbook/atlas with empty array when state has cards,
        // preserve the state data instead of wiping it
        try {
          const patchZones = zonesCandidate as Record<
            string,
            Record<string, unknown[]>
          > | null;
          for (const seat of ["p1", "p2"] as PlayerKey[]) {
            // In CPU matches the server fully controls the CPU's zones,
            // so wipe-protection does not apply to the CPU seat.
            if (seat === cpuSeat) continue;

            const stateZones = state.zones?.[seat];
            const patchSeatZones = patchZones?.[seat] as Record<
              string,
              unknown[]
            > | null;
            // Critical piles that should never be accidentally wiped
            for (const zoneName of ["spellbook", "atlas"] as (keyof Zones)[]) {
              const stateArr = stateZones?.[zoneName] as unknown[] | undefined;
              const stateCount = stateArr?.length ?? 0;
              const patchVal = patchSeatZones?.[zoneName];
              // GUARD: If patch would wipe a pile that has cards, preserve state data
              if (
                stateCount > 0 &&
                Array.isArray(patchVal) &&
                patchVal.length === 0
              ) {
                console.error(
                  `[PILE_WIPE_BLOCKED] ${seat}.${zoneName}: patch has [] but state has ${stateCount} cards - preserving state`,
                );
                // Restore from state to prevent wipe
                if (patchSeatZones && stateArr) {
                  patchSeatZones[zoneName] = stateArr;
                }
              }
            }
            // HARDENING: Block suspicious hand wipes
            // Hand CAN legitimately become empty (played all cards), but if the patch
            // would wipe a hand with many cards AND the patch also has permanents with
            // __replaceKeys (typical endTurn patch), it's likely a stale server sync issue.
            // Block these suspicious wipes to protect against server sending stale zone data.
            const handStateCount =
              (stateZones?.hand as unknown[] | undefined)?.length ?? 0;
            const handPatchVal = patchSeatZones?.hand;
            if (
              handStateCount > 0 &&
              Array.isArray(handPatchVal) &&
              handPatchVal.length === 0
            ) {
              // Suspicious if: wiping 3+ cards AND patch has permanents replacement
              // This pattern matches the stale-server-zone-data bug
              const isSuspiciousWipe =
                handStateCount >= 3 && replaceKeys.has("permanents");
              if (isSuspiciousWipe) {
                console.error(
                  `[HAND_WIPE_BLOCKED] ${seat}.hand: patch has [] but state has ${handStateCount} cards (suspicious: permanents replacement) - preserving state`,
                );
                // Restore from state to prevent wipe
                if (patchSeatZones && stateZones?.hand) {
                  patchSeatZones.hand = stateZones.hand as unknown[];
                }
              } else {
                console.warn(
                  `[ZONE_WIPE_DETECT] ${seat}.hand: patch has [] but state has ${handStateCount} cards`,
                );
              }
            }
          }
        } catch {}
        next.zones = normalizeZones(zonesCandidate, state.zones);
      }
      if (p.avatars !== undefined) {
        const candidate = replaceKeys.has("avatars")
          ? (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)
          : (deepMergeReplaceArrays(state.avatars, p.avatars) as Partial<
              Record<PlayerKey, Partial<AvatarState>>
            >);
        next.avatars = normalizeAvatars(
          candidate,
          replaceKeys.has("avatars") ? undefined : state.avatars,
        );

        // Preserve existing avatar cards if not explicitly updated in the patch
        // This prevents avatars from disappearing on reload/reconnect
        if (replaceKeys.has("avatars")) {
          const p1Candidate = (
            p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>
          )?.p1;
          const p2Candidate = (
            p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>
          )?.p2;

          if (
            p1Candidate &&
            !("card" in p1Candidate) &&
            state.avatars?.p1?.card
          ) {
            next.avatars = {
              ...next.avatars,
              p1: { ...next.avatars.p1, card: state.avatars.p1.card },
            } as GameState["avatars"];
          }
          if (
            p2Candidate &&
            !("card" in p2Candidate) &&
            state.avatars?.p2?.card
          ) {
            next.avatars = {
              ...next.avatars,
              p2: { ...next.avatars.p2, card: state.avatars.p2.card },
            } as GameState["avatars"];
          }
        }
      }
      if (p.permanents !== undefined) {
        const source = replaceKeys.has("permanents")
          ? (p.permanents as Permanents)
          : mergePermanentsMap(state.permanents, p.permanents);
        next.permanents = normalizePermanentsRecord(
          source as Permanents,
        ) as GameState["permanents"];

        // PERMANENTS HARDENING: Prevent accidental board wipes
        // If we had permanents before and the patch would wipe them all (non-snapshot),
        // preserve the original permanents instead
        if (!replaceKeys.has("permanents")) {
          const prevPermCount = Object.values(state.permanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0,
          );
          const nextPermCount = Object.values(next.permanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0,
          );
          // Delta removals (__remove: true) are targeted extractions, not board wipes.
          // Bypass hardening so a spell that is the only permanent can be legally removed.
          const patchHasDeltaRemovals = Object.values(
            p.permanents as Record<string, unknown>,
          ).some(
            (arr) =>
              Array.isArray(arr) &&
              arr.some(
                (item) =>
                  item &&
                  typeof item === "object" &&
                  (item as Record<string, unknown>).__remove === true,
              ),
          );
          if (prevPermCount > 0 && nextPermCount === 0 && !patchHasDeltaRemovals) {
            console.warn(
              `[PERMANENTS_HARDENING] Prevented board wipe: patch would clear all ${prevPermCount} permanents`,
              {
                patchPermanentsKeys: Object.keys(p.permanents || {}),
                statePermanentsKeys: Object.keys(state.permanents || {}),
              },
            );
            // Restore original permanents
            next.permanents = state.permanents;
          }
        }

        // Detect Lilith/Mother Nature minions in permanents
        // On snapshot replace, register ALL existing Lilith/Mother Nature
        // On incremental patch, only register NEW ones
        const prevPermanents = state.permanents || {};
        const nextPermanents = next.permanents || {};
        const isFullReplace = replaceKeys.has("permanents");

        // Get already registered instance IDs to avoid duplicates
        const registeredLiliths = new Set(
          (state.lilithMinions || []).map((l) => l.instanceId),
        );
        const registeredMotherNatures = new Set(
          (state.motherNatureMinions || []).map((m) => m.instanceId),
        );

        const prevInstanceIds = new Set<string>();
        if (!isFullReplace) {
          for (const cellKey of Object.keys(prevPermanents)) {
            for (const perm of prevPermanents[cellKey] || []) {
              if (perm.instanceId) prevInstanceIds.add(perm.instanceId);
            }
          }
        }

        // Schedule registration after state update
        const newMinionsToRegister: Array<{
          type: "lilith" | "motherNature";
          instanceId: string;
          location: string;
          ownerSeat: PlayerKey;
          cardName: string;
        }> = [];

        for (const cellKey of Object.keys(nextPermanents)) {
          for (const perm of nextPermanents[cellKey] || []) {
            if (!perm.instanceId) continue;
            // Skip if already in prev (for incremental) or already registered
            if (!isFullReplace && prevInstanceIds.has(perm.instanceId))
              continue;

            const cardName = (perm.card?.name || "").toLowerCase();
            const cardType = (perm.card?.type || "").toLowerCase();
            const ownerSeat = seatFromOwner(perm.owner);

            if (cardName === "lilith" && cardType.includes("minion")) {
              if (!registeredLiliths.has(perm.instanceId)) {
                newMinionsToRegister.push({
                  type: "lilith",
                  instanceId: perm.instanceId,
                  location: cellKey,
                  ownerSeat,
                  cardName: perm.card?.name || "Lilith",
                });
              }
            } else if (
              cardName === "mother nature" &&
              cardType.includes("minion")
            ) {
              if (!registeredMotherNatures.has(perm.instanceId)) {
                newMinionsToRegister.push({
                  type: "motherNature",
                  instanceId: perm.instanceId,
                  location: cellKey,
                  ownerSeat,
                  cardName: perm.card?.name || "Mother Nature",
                });
              }
            }
          }
        }

        if (newMinionsToRegister.length > 0) {
          setTimeout(() => {
            for (const minion of newMinionsToRegister) {
              try {
                if (minion.type === "lilith") {
                  if (process.env.NODE_ENV !== "production")
                    console.log(
                      "[networkState] Registering Lilith from patch:",
                      minion,
                    );
                  get().registerLilith({
                    instanceId: minion.instanceId,
                    location: minion.location,
                    ownerSeat: minion.ownerSeat,
                    cardName: minion.cardName,
                  });
                } else if (minion.type === "motherNature") {
                  if (process.env.NODE_ENV !== "production")
                    console.log(
                      "[networkState] Registering Mother Nature from patch:",
                      minion,
                    );
                  get().registerMotherNature({
                    instanceId: minion.instanceId,
                    location: minion.location,
                    ownerSeat: minion.ownerSeat,
                    cardName: minion.cardName,
                  });
                }
              } catch (e) {
                console.error("[networkState] Error registering minion:", e);
              }
            }
          }, 0);
        }
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? p.mulligans
          : (deepMergeReplaceArrays(
              state.mulligans,
              p.mulligans,
            ) as GameState["mulligans"]);
      } else if (replaceKeys.has("mulligans")) {
        next.mulligans = { p1: 0, p2: 0 } as GameState["mulligans"];
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? p.mulliganDrawn
          : (deepMergeReplaceArrays(
              state.mulliganDrawn,
              p.mulliganDrawn,
            ) as GameState["mulliganDrawn"]);
      } else if (replaceKeys.has("mulliganDrawn")) {
        next.mulliganDrawn = { p1: [], p2: [] } as GameState["mulliganDrawn"];
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : (deepMergeReplaceArrays(
              state.permanentPositions,
              p.permanentPositions,
            ) as GameState["permanentPositions"]);
      } else if (replaceKeys.has("permanentPositions")) {
        next.permanentPositions = {} as GameState["permanentPositions"];
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : (deepMergeReplaceArrays(
              state.permanentAbilities,
              p.permanentAbilities,
            ) as GameState["permanentAbilities"]);
      } else if (replaceKeys.has("permanentAbilities")) {
        next.permanentAbilities = {} as GameState["permanentAbilities"];
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : (deepMergeReplaceArrays(
              state.sitePositions,
              p.sitePositions,
            ) as GameState["sitePositions"]);
      } else if (replaceKeys.has("sitePositions")) {
        next.sitePositions = {} as GameState["sitePositions"];
      }
      if (p.playerPositions !== undefined) {
        const candidate = replaceKeys.has("playerPositions")
          ? (p.playerPositions as Partial<
              Record<PlayerKey, Partial<PlayerPositionReference>>
            >)
          : (deepMergeReplaceArrays(
              state.playerPositions,
              p.playerPositions,
            ) as Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>);
        next.playerPositions = normalizePlayerPositions(
          candidate,
          replaceKeys.has("playerPositions")
            ? undefined
            : state.playerPositions,
        );
      } else if (replaceKeys.has("playerPositions")) {
        next.playerPositions = createDefaultPlayerPositions();
      }
      if (p.events !== undefined) {
        // Merge events deterministically
        next.events = replaceKeys.has("events")
          ? Array.isArray(p.events)
            ? p.events
            : []
          : mergeEvents(state.events, Array.isArray(p.events) ? p.events : []);
        next.eventSeq = Math.max(state.eventSeq, Number(p.eventSeq) || 0);
      }
      // Harbinger portal state (Gothic expansion)
      if (p.portalState !== undefined) {
        next.portalState = replaceKeys.has("portalState")
          ? p.portalState
          : p.portalState; // Portal state is always replaced, not merged
      } else if (replaceKeys.has("portalState")) {
        next.portalState = null;
      }
      // Second player seer state
      if (p.seerState !== undefined) {
        next.seerState = p.seerState; // Seer state is always replaced, not merged
      } else if (replaceKeys.has("seerState")) {
        next.seerState = null;
      }
      // Imposter mask state (Gothic expansion)
      if (p.imposterMasks !== undefined) {
        next.imposterMasks = p.imposterMasks; // Mask state is always replaced, not merged
      } else if (replaceKeys.has("imposterMasks")) {
        next.imposterMasks = { p1: null, p2: null };
      }
      // Necromancer skeleton used state (Gothic expansion)
      if (p.necromancerSkeletonUsed !== undefined) {
        next.necromancerSkeletonUsed = p.necromancerSkeletonUsed;
      } else if (replaceKeys.has("necromancerSkeletonUsed")) {
        next.necromancerSkeletonUsed = { p1: false, p2: false };
      }
      // Harbinger portal discount used state (Gothic expansion)
      if (p.harbingerPortalDiscountUsed !== undefined) {
        next.harbingerPortalDiscountUsed = p.harbingerPortalDiscountUsed;
      } else if (replaceKeys.has("harbingerPortalDiscountUsed")) {
        next.harbingerPortalDiscountUsed = { p1: false, p2: false };
      }
      // Assimilator Snail used state
      if (p.assimilatorSnailUsed !== undefined) {
        next.assimilatorSnailUsed = p.assimilatorSnailUsed;
      } else if (replaceKeys.has("assimilatorSnailUsed")) {
        next.assimilatorSnailUsed = { p1: false, p2: false };
      }
      // Assimilator Snail transform tracking
      if (p.assimilatorSnailTransforms !== undefined) {
        next.assimilatorSnailTransforms = p.assimilatorSnailTransforms;
      } else if (replaceKeys.has("assimilatorSnailTransforms")) {
        next.assimilatorSnailTransforms = [];
      }
      // Ether Core turn-start tracking (for void mana calculation)
      if (p.etherCoresInVoidAtTurnStart !== undefined) {
        next.etherCoresInVoidAtTurnStart = p.etherCoresInVoidAtTurnStart;
      } else if (replaceKeys.has("etherCoresInVoidAtTurnStart")) {
        next.etherCoresInVoidAtTurnStart = [];
      }
      // Cores carried at turn start (for carried-core mana calculation)
      if (p.coresCarriedAtTurnStart !== undefined) {
        next.coresCarriedAtTurnStart = p.coresCarriedAtTurnStart;
      } else if (replaceKeys.has("coresCarriedAtTurnStart")) {
        next.coresCarriedAtTurnStart = [];
      }
      // Mephistopheles summon used state (Gothic expansion)
      if (p.mephistophelesSummonUsed !== undefined) {
        next.mephistophelesSummonUsed = p.mephistophelesSummonUsed;
      } else if (replaceKeys.has("mephistophelesSummonUsed")) {
        next.mephistophelesSummonUsed = { p1: false, p2: false };
      }
      // Pending Mephistopheles state (Gothic expansion)
      if (p.pendingMephistopheles !== undefined) {
        next.pendingMephistopheles = p.pendingMephistopheles;
      } else if (replaceKeys.has("pendingMephistopheles")) {
        next.pendingMephistopheles = null;
      }
      // Pending Mephistopheles Summon state (Gothic expansion)
      if (p.pendingMephistophelesSummon !== undefined) {
        next.pendingMephistophelesSummon = p.pendingMephistophelesSummon;
      } else if (replaceKeys.has("pendingMephistophelesSummon")) {
        next.pendingMephistophelesSummon = null;
      }
      // Druid flipped state (Arthurian Legends)
      if (p.druidFlipped !== undefined) {
        next.druidFlipped = p.druidFlipped;
      } else if (replaceKeys.has("druidFlipped")) {
        next.druidFlipped = { p1: false, p2: false };
      }
      // Pathfinder used state (tracks if ability was used this turn)
      if (p.pathfinderUsed !== undefined) {
        next.pathfinderUsed = p.pathfinderUsed;
        if (process.env.NODE_ENV !== "production")
          console.log(
            "[PATHFINDER] applyServerPatch received pathfinderUsed:",
            {
              incoming: p.pathfinderUsed,
              prev: state.pathfinderUsed,
            },
          );
      } else if (replaceKeys.has("pathfinderUsed")) {
        next.pathfinderUsed = { p1: false, p2: false };
      }
      // Geomancer rubble used (replace on turn change, merge otherwise)
      if (p.geomancerRubbleUsed !== undefined) {
        if (replaceKeys.has("geomancerRubbleUsed")) {
          next.geomancerRubbleUsed = { p1: false, p2: false };
        } else {
          next.geomancerRubbleUsed = {
            ...state.geomancerRubbleUsed,
            ...p.geomancerRubbleUsed,
          };
        }
      } else if (replaceKeys.has("geomancerRubbleUsed")) {
        next.geomancerRubbleUsed = { p1: false, p2: false };
      }
      // Special site state (Valley of Delight, Mismanaged Mortuary, etc.)
      // Always replace, don't merge (arrays inside)
      if (p.specialSiteState !== undefined) {
        next.specialSiteState = p.specialSiteState;
      }
      // Garden of Eden locations (draw limit tracking)
      // Replace completely - both players need this data
      if (p.gardenOfEdenLocations !== undefined) {
        next.gardenOfEdenLocations = p.gardenOfEdenLocations;
      }
      // Cards drawn this turn (for Garden of Eden tracking)
      if (p.cardsDrawnThisTurn !== undefined) {
        next.cardsDrawnThisTurn = p.cardsDrawnThisTurn;
      }
      // Pith Imp private hands (stolen cards)
      // CRITICAL: Do NOT clear based on replaceKeys - owner tracks locally, server snapshots would wipe it
      if (p.pithImpHands !== undefined) {
        next.pithImpHands = p.pithImpHands;
      }
      // NOTE: No else if (replaceKeys.has("pithImpHands")) - intentionally omitted to prevent server snapshot wipes
      // Morgana private hands
      if (p.morganaHands !== undefined) {
        next.morganaHands = p.morganaHands;
      }
      // NOTE: No else if for morganaHands either - same reason
      // Omphalos private hands
      if (p.omphalosHands !== undefined) {
        next.omphalosHands = p.omphalosHands;
      }
      // NOTE: No else if for omphalosHands either - same reason

      // Gem tokens (draggable tokens on board)
      if (p.gemTokens !== undefined) {
        next.gemTokens = p.gemTokens;
      } else if (replaceKeys.has("gemTokens")) {
        next.gemTokens = [];
      }

      // Babel Tower merge tracking (Tower of Babel = Base + Apex stacked)
      // Always replace the array, don't merge (array of merge records)
      if (p.babelTowers !== undefined) {
        next.babelTowers = p.babelTowers;
      } else if (replaceKeys.has("babelTowers")) {
        next.babelTowers = [];
      }

      // Snapshot creation is handled by GameToolbox.tsx useEffect

      const lastTs =
        typeof t === "number"
          ? Math.max(state.lastServerTs ?? 0, t)
          : Date.now();
      const extra: Partial<GameState> = {};
      if (replaceKeys.size > 0) {
        const pending = state.pendingPatches ?? [];
        const remainingPending: ServerPatchT[] = [];
        if (pending.length > 0) {
          for (const candidate of pending) {
            if (
              !candidate ||
              typeof candidate !== "object" ||
              !candidate.__replaceKeys ||
              !Array.isArray(candidate.__replaceKeys)
            ) {
              continue;
            }
            const overlap = candidate.__replaceKeys.some((key) =>
              replaceKeys.has(key),
            );
            if (!overlap) {
              remainingPending.push(candidate);
            }
          }
          if (remainingPending.length !== pending.length) {
            extra.pendingPatches = remainingPending;
            try {
              console.debug("[net] Pending patches trimmed after snapshot", {
                before: pending.length,
                after: remainingPending.length,
                replaceKeys: Array.from(replaceKeys),
              });
            } catch {}
          }
        }
      }

      if (
        p.board !== undefined ||
        p.zones !== undefined ||
        p.permanents !== undefined
      ) {
        try {
          const mergedPerCount = Object.values(
            (next.permanents ?? state.permanents) || {},
          ).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
          const mergedSummary = {
            p1: {
              hand: (next.zones ?? state.zones)?.p1?.hand?.length ?? 0,
              spellbook:
                (next.zones ?? state.zones)?.p1?.spellbook?.length ?? 0,
              atlas: (next.zones ?? state.zones)?.p1?.atlas?.length ?? 0,
              graveyard:
                (next.zones ?? state.zones)?.p1?.graveyard?.length ?? 0,
            },
            p2: {
              hand: (next.zones ?? state.zones)?.p2?.hand?.length ?? 0,
              spellbook:
                (next.zones ?? state.zones)?.p2?.spellbook?.length ?? 0,
              atlas: (next.zones ?? state.zones)?.p2?.atlas?.length ?? 0,
              graveyard:
                (next.zones ?? state.zones)?.p2?.graveyard?.length ?? 0,
            },
          };
          console.debug("[net] snapshot(next)", {
            permanentsCount: mergedPerCount,
            zones: mergedSummary,
            hasPermanentPositions: !!(
              next.permanentPositions ?? state.permanentPositions
            ),
          });
        } catch {}
      }

      const result = {
        ...state,
        ...next,
        ...extra,
        lastServerTs: lastTs,
      } as Partial<GameState> as GameState;

      // DEBUG: Log if avatars or permanents are being lost
      try {
        const prevAvatarP1 = !!state.avatars?.p1?.card;
        const prevAvatarP2 = !!state.avatars?.p2?.card;
        const nextAvatarP1 = !!result.avatars?.p1?.card;
        const nextAvatarP2 = !!result.avatars?.p2?.card;
        const prevPermCount = Object.values(state.permanents || {}).reduce(
          (a, v) => a + (Array.isArray(v) ? v.length : 0),
          0,
        );
        const nextPermCount = Object.values(result.permanents || {}).reduce(
          (a, v) => a + (Array.isArray(v) ? v.length : 0),
          0,
        );
        if (
          (prevAvatarP1 && !nextAvatarP1) ||
          (prevAvatarP2 && !nextAvatarP2) ||
          (prevPermCount > 0 && nextPermCount === 0)
        ) {
          // Log each field separately to avoid object collapse
          console.error("[net] CRITICAL: State loss detected!");
          console.error(
            "[net] Avatars - prev:",
            prevAvatarP1,
            prevAvatarP2,
            "next:",
            nextAvatarP1,
            nextAvatarP2,
          );
          console.error(
            "[net] Permanents - prev:",
            prevPermCount,
            "next:",
            nextPermCount,
          );
          console.error("[net] Patch keys:", Object.keys(p).join(", "));
          console.error("[net] Next keys:", Object.keys(next).join(", "));
          console.error(
            "[net] Replace keys:",
            Array.from(replaceKeys).join(", "),
          );
          console.error("[net] Has avatars in patch:", p.avatars !== undefined);
          console.error(
            "[net] Has permanents in patch:",
            p.permanents !== undefined,
          );
          // Log the actual patch for debugging
          try {
            console.error(
              "[net] Patch content:",
              JSON.stringify(p, null, 2).slice(0, 2000),
            );
          } catch {
            console.error("[net] Could not stringify patch");
          }
        }
      } catch (err) {
        console.error("[net] Error in state loss detection:", err);
      }
      return result;
    }),

  applyPatch: (patch) =>
    set((state) => {
      if (!patch || typeof patch !== "object") return state as GameState;

      const p = patch as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : [],
      );

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : (deepMergeReplaceArrays(
              state.players,
              p.players,
            ) as GameState["players"]);
      } else if (replaceKeys.has("players")) {
        next.players = createInitialPlayers();
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = p.d20Rolls;
      }
      if (p.setupWinner !== undefined) {
        next.setupWinner = p.setupWinner;
      }
      if (p.matchEnded !== undefined) {
        next.matchEnded = p.matchEnded;
      }
      if (p.winner !== undefined) {
        next.winner = p.winner;
      }
      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? (p.board as GameState["board"])
          : (deepMergeReplaceArrays(
              state.board,
              p.board,
            ) as GameState["board"]);
      }
      if (p.zones !== undefined) {
        next.zones = replaceKeys.has("zones")
          ? (p.zones as GameState["zones"])
          : (deepMergeReplaceArrays(
              state.zones,
              p.zones,
            ) as GameState["zones"]);
      }
      if (p.avatars !== undefined) {
        next.avatars = replaceKeys.has("avatars")
          ? (p.avatars as GameState["avatars"])
          : (deepMergeReplaceArrays(
              state.avatars,
              p.avatars,
            ) as GameState["avatars"]);
      }
      if (p.permanents !== undefined) {
        if (replaceKeys.has("permanents")) {
          const candidatePermanents = normalizePermanentsRecord(
            (p.permanents as Permanents) || ({} as Permanents),
          ) as GameState["permanents"];

          // PERMANENTS HARDENING: Prevent accidental board wipes even with __replaceKeys
          const prevPermCount = Object.values(state.permanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0,
          );
          const nextPermCount = Object.values(candidatePermanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0,
          );
          // Block if wiping more than half the board (suspicious)
          if (prevPermCount > 4 && nextPermCount < prevPermCount / 2) {
            console.error(
              `[PERMANENTS_HARDENING] applyPatch (replace): Blocked suspicious wipe: ${prevPermCount} -> ${nextPermCount} permanents`,
            );
            next.permanents = state.permanents;
          } else {
            next.permanents = candidatePermanents;
          }
        } else {
          const merged = mergePermanentsMap(state.permanents, p.permanents);
          next.permanents = normalizePermanentsRecord(
            merged as Permanents,
          ) as GameState["permanents"];

          // PERMANENTS HARDENING: Prevent accidental board wipes in applyPatch
          const prevPermCount = Object.values(state.permanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0,
          );
          const nextPermCount = Object.values(next.permanents || {}).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0,
          );
          // Delta removals (__remove: true) are targeted — bypass hardening.
          const applyPatchHasDeltaRemovals = Object.values(
            p.permanents as Record<string, unknown>,
          ).some(
            (arr) =>
              Array.isArray(arr) &&
              arr.some(
                (item) =>
                  item &&
                  typeof item === "object" &&
                  (item as Record<string, unknown>).__remove === true,
              ),
          );
          if (prevPermCount > 0 && nextPermCount === 0 && !applyPatchHasDeltaRemovals) {
            console.warn(
              `[PERMANENTS_HARDENING] applyPatch: Prevented board wipe: patch would clear all ${prevPermCount} permanents`,
            );
            next.permanents = state.permanents;
          }
        }
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? (p.mulligans as GameState["mulligans"])
          : (deepMergeReplaceArrays(
              state.mulligans,
              p.mulligans,
            ) as GameState["mulligans"]);
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? (p.mulliganDrawn as GameState["mulliganDrawn"])
          : (deepMergeReplaceArrays(
              state.mulliganDrawn,
              p.mulliganDrawn,
            ) as GameState["mulliganDrawn"]);
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : (deepMergeReplaceArrays(
              state.permanentPositions,
              p.permanentPositions,
            ) as GameState["permanentPositions"]);
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : (deepMergeReplaceArrays(
              state.permanentAbilities,
              p.permanentAbilities,
            ) as GameState["permanentAbilities"]);
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : (deepMergeReplaceArrays(
              state.sitePositions,
              p.sitePositions,
            ) as GameState["sitePositions"]);
      }
      if (p.playerPositions !== undefined) {
        next.playerPositions = replaceKeys.has("playerPositions")
          ? (p.playerPositions as GameState["playerPositions"])
          : (deepMergeReplaceArrays(
              state.playerPositions,
              p.playerPositions,
            ) as GameState["playerPositions"]);
      }
      if (p.events !== undefined) {
        if (replaceKeys.has("events")) {
          const ev = (p.events as GameState["events"]) || [];
          next.events = ev;
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(Number(p.eventSeq) || 0, 0)
              : Math.max(
                  ev.reduce((mx, e) => Math.max(mx, Number(e.id) || 0), 0),
                  0,
                );
        } else {
          const merged = mergeEvents(
            state.events,
            (p.events as GameState["events"]) || [],
          );
          next.events = merged;
          const mergedMaxId = merged.reduce(
            (mx, e) => Math.max(mx, Number(e.id) || 0),
            0,
          );
          const candidateSeq = Math.max(state.eventSeq, mergedMaxId);
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(candidateSeq, Number(p.eventSeq) || 0)
              : candidateSeq;
        }
      } else if (p.eventSeq !== undefined) {
        next.eventSeq = replaceKeys.has("eventSeq")
          ? Math.max(Number(p.eventSeq) || 0, 0)
          : Math.max(state.eventSeq, Number(p.eventSeq) || 0);
      }
      // Portal state (Gothic expansion) - applyPatch version
      if (p.portalState !== undefined) {
        next.portalState = p.portalState;
      }
      // Seer state - applyPatch version
      if (p.seerState !== undefined) {
        next.seerState = p.seerState;
      }
      // Imposter mask state (Gothic expansion) - applyPatch version
      if (p.imposterMasks !== undefined) {
        next.imposterMasks = p.imposterMasks;
      }
      // Necromancer skeleton used state - applyPatch version
      if (p.necromancerSkeletonUsed !== undefined) {
        next.necromancerSkeletonUsed = p.necromancerSkeletonUsed;
      }
      // Harbinger portal discount used state - applyPatch version
      if (p.harbingerPortalDiscountUsed !== undefined) {
        next.harbingerPortalDiscountUsed = p.harbingerPortalDiscountUsed;
      }
      // Ether Core turn-start tracking - applyPatch version
      if (p.etherCoresInVoidAtTurnStart !== undefined) {
        next.etherCoresInVoidAtTurnStart = p.etherCoresInVoidAtTurnStart;
      }
      // Cores carried at turn start - applyPatch version
      if (p.coresCarriedAtTurnStart !== undefined) {
        next.coresCarriedAtTurnStart = p.coresCarriedAtTurnStart;
      }
      // Mephistopheles summon used state - applyPatch version
      if (p.mephistophelesSummonUsed !== undefined) {
        next.mephistophelesSummonUsed = p.mephistophelesSummonUsed;
      }
      // Pending Mephistopheles state - applyPatch version
      if (p.pendingMephistopheles !== undefined) {
        next.pendingMephistopheles = p.pendingMephistopheles;
      }
      // Pending Mephistopheles Summon state - applyPatch version
      if (p.pendingMephistophelesSummon !== undefined) {
        next.pendingMephistophelesSummon = p.pendingMephistophelesSummon;
      }
      // Druid flipped state - applyPatch version
      if (p.druidFlipped !== undefined) {
        next.druidFlipped = p.druidFlipped;
      }
      // Pathfinder used state - applyPatch version
      if (p.pathfinderUsed !== undefined) {
        next.pathfinderUsed = p.pathfinderUsed;
      }
      // Special site state (Valley of Delight, Mismanaged Mortuary, etc.) - applyPatch version
      // Use replaceKeys to fully replace the state (arrays don't merge well)
      if (p.specialSiteState !== undefined) {
        next.specialSiteState = replaceKeys.has("specialSiteState")
          ? (p.specialSiteState as GameState["specialSiteState"])
          : (p.specialSiteState as GameState["specialSiteState"]);
      }
      // Garden of Eden locations - applyPatch version
      if (p.gardenOfEdenLocations !== undefined) {
        next.gardenOfEdenLocations = p.gardenOfEdenLocations;
      }
      // Cards drawn this turn - applyPatch version
      if (p.cardsDrawnThisTurn !== undefined) {
        next.cardsDrawnThisTurn = p.cardsDrawnThisTurn;
      }
      // Babel Tower merge tracking - applyPatch version
      if (p.babelTowers !== undefined) {
        next.babelTowers = p.babelTowers;
      }

      // CRITICAL: Spread state first, then next - otherwise we lose all state not in the patch
      return {
        ...state,
        ...next,
      } as Partial<GameState> as GameState;
    }),
});
