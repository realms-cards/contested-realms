import type { StateCreator } from "zustand";
import type {
  AvatarState,
  GameState,
  Permanents,
  PlayerKey,
  ServerPatchT,
} from "./types";
import type { PlayerPositionReference } from "../types";
import { filterEchoPatchIfAny } from "./transportState";
import { normalizeAvatars } from "./utils/avatarHelpers";
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
import { clearSnapshotsStorageFor } from "./utils/snapshotHelpers";
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
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
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
              0
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
                  0
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
      const shouldClearSnapshots =
        replaceKeys.has("players") ||
        replaceKeys.has("board") ||
        replaceKeys.has("zones") ||
        replaceKeys.has("avatars") ||
        replaceKeys.has("permanents");

      if (p.players !== undefined) {
        // DEBUG: Log mana values before and after merge to track accumulation bug
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
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : (deepMergeReplaceArrays(
              state.players,
              p.players
            ) as GameState["players"]);
        // DEBUG: Log result
        try {
          console.log("[applyServerPatch] players result:", {
            resultManaP1: next.players?.p1?.mana,
            resultManaP2: next.players?.p2?.mana,
          });
        } catch {}
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
        console.log(
          "[applyServerPatch] Turn changing:",
          endingPlayerSeat,
          "->",
          startingPlayerSeat,
          "(we are",
          actorKey,
          ")"
        );

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
                e
              );
            }
          }, 500);
        }
      }

      if (p.d20Rolls !== undefined) {
        next.d20Rolls = replaceKeys.has("d20Rolls")
          ? p.d20Rolls
          : (deepMergeReplaceArrays(
              state.d20Rolls,
              p.d20Rolls
            ) as GameState["d20Rolls"]);
        try {
          console.log("[applyServerPatch] Applied d20Rolls:", {
            prev: state.d20Rolls,
            new: next.d20Rolls,
            isReplace: replaceKeys.has("d20Rolls"),
          });
        } catch {}
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
              p.board
            ) as GameState["board"]);
      }
      if (p.zones !== undefined) {
        // DEBUG: Log zone patch details
        try {
          const pZones = p.zones as Record<string, unknown>;
          console.log("[net] zones patch received", {
            patchKeys: Object.keys(pZones || {}),
            hasP1: !!pZones?.p1,
            hasP2: !!pZones?.p2,
            replaceZones: replaceKeys.has("zones"),
            stateP1Hand: state.zones?.p1?.hand?.length,
            stateP2Hand: state.zones?.p2?.hand?.length,
            stateP1Graveyard: state.zones?.p1?.graveyard?.length,
            stateP2Graveyard: state.zones?.p2?.graveyard?.length,
            stateAvatarsP1: !!state.avatars?.p1?.card,
            stateAvatarsP2: !!state.avatars?.p2?.card,
            statePermanentsCount: Object.values(state.permanents || {}).reduce(
              (a, v) => a + (Array.isArray(v) ? v.length : 0),
              0
            ),
          });
        } catch {}
        let zonesCandidate = replaceKeys.has("zones")
          ? (p.zones as GameState["zones"])
          : (deepMergeReplaceArrays(state.zones, p.zones) as Partial<
              Record<PlayerKey, GameState["zones"][PlayerKey]>
            >);

        // CRITICAL: Filter out stolen cards from incoming zones patches
        // Server doesn't know about pithImpHands, so it may re-add stolen cards during turn transitions
        // EXCEPT: Don't filter cards that are being returned (tracked in processedPithImpReturns)
        const pithImpHands = state.pithImpHands || [];
        const processedReturns =
          state.processedPithImpReturns || new Set<string>();
        if (pithImpHands.length > 0 && zonesCandidate) {
          const stolenCardIds = new Set<number>();
          for (const pithImpEntry of pithImpHands) {
            // Skip entries that are being returned (race condition: set() hasn't flushed yet)
            if (!processedReturns.has(pithImpEntry.id)) {
              for (const card of pithImpEntry.hand) {
                stolenCardIds.add(card.cardId);
              }
            }
          }
          if (stolenCardIds.size > 0) {
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
                    (c) => !stolenCardIds.has(c.cardId)
                  ),
                };
              }
            }
            zonesCandidate = filteredZones;
          }
        }

        next.zones = normalizeZones(
          zonesCandidate,
          replaceKeys.has("zones") ? undefined : state.zones
        );
      }
      if (p.avatars !== undefined) {
        const candidate = replaceKeys.has("avatars")
          ? (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)
          : (deepMergeReplaceArrays(state.avatars, p.avatars) as Partial<
              Record<PlayerKey, Partial<AvatarState>>
            >);
        next.avatars = normalizeAvatars(
          candidate,
          replaceKeys.has("avatars") ? undefined : state.avatars
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
          source as Permanents
        ) as GameState["permanents"];

        // Detect Lilith/Mother Nature minions in permanents
        // On snapshot replace, register ALL existing Lilith/Mother Nature
        // On incremental patch, only register NEW ones
        const prevPermanents = state.permanents || {};
        const nextPermanents = next.permanents || {};
        const isFullReplace = replaceKeys.has("permanents");

        // Get already registered instance IDs to avoid duplicates
        const registeredLiliths = new Set(
          (state.lilithMinions || []).map((l) => l.instanceId)
        );
        const registeredMotherNatures = new Set(
          (state.motherNatureMinions || []).map((m) => m.instanceId)
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
            const ownerSeat = (perm.owner === 1 ? "p1" : "p2") as PlayerKey;

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
                  console.log(
                    "[networkState] Registering Lilith from patch:",
                    minion
                  );
                  get().registerLilith({
                    instanceId: minion.instanceId,
                    location: minion.location,
                    ownerSeat: minion.ownerSeat,
                    cardName: minion.cardName,
                  });
                } else if (minion.type === "motherNature") {
                  console.log(
                    "[networkState] Registering Mother Nature from patch:",
                    minion
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
              p.mulligans
            ) as GameState["mulligans"]);
      } else if (replaceKeys.has("mulligans")) {
        next.mulligans = { p1: 0, p2: 0 } as GameState["mulligans"];
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? p.mulliganDrawn
          : (deepMergeReplaceArrays(
              state.mulliganDrawn,
              p.mulliganDrawn
            ) as GameState["mulliganDrawn"]);
      } else if (replaceKeys.has("mulliganDrawn")) {
        next.mulliganDrawn = { p1: [], p2: [] } as GameState["mulliganDrawn"];
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : (deepMergeReplaceArrays(
              state.permanentPositions,
              p.permanentPositions
            ) as GameState["permanentPositions"]);
      } else if (replaceKeys.has("permanentPositions")) {
        next.permanentPositions = {} as GameState["permanentPositions"];
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : (deepMergeReplaceArrays(
              state.permanentAbilities,
              p.permanentAbilities
            ) as GameState["permanentAbilities"]);
      } else if (replaceKeys.has("permanentAbilities")) {
        next.permanentAbilities = {} as GameState["permanentAbilities"];
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : (deepMergeReplaceArrays(
              state.sitePositions,
              p.sitePositions
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
              p.playerPositions
            ) as Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>);
        next.playerPositions = normalizePlayerPositions(
          candidate,
          replaceKeys.has("playerPositions") ? undefined : state.playerPositions
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
      // Druid flipped state (Arthurian Legends)
      if (p.druidFlipped !== undefined) {
        next.druidFlipped = p.druidFlipped;
      } else if (replaceKeys.has("druidFlipped")) {
        next.druidFlipped = { p1: false, p2: false };
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
              replaceKeys.has(key)
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
            (next.permanents ?? state.permanents) || {}
          ).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
          const mergedSummary = {
            p1: {
              hand: (next.zones ?? state.zones)?.p1?.hand?.length ?? 0,
              spellbook:
                (next.zones ?? state.zones)?.p1?.spellbook?.length ?? 0,
              graveyard:
                (next.zones ?? state.zones)?.p1?.graveyard?.length ?? 0,
            },
            p2: {
              hand: (next.zones ?? state.zones)?.p2?.hand?.length ?? 0,
              spellbook:
                (next.zones ?? state.zones)?.p2?.spellbook?.length ?? 0,
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
          0
        );
        const nextPermCount = Object.values(result.permanents || {}).reduce(
          (a, v) => a + (Array.isArray(v) ? v.length : 0),
          0
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
            nextAvatarP2
          );
          console.error(
            "[net] Permanents - prev:",
            prevPermCount,
            "next:",
            nextPermCount
          );
          console.error("[net] Patch keys:", Object.keys(p).join(", "));
          console.error("[net] Next keys:", Object.keys(next).join(", "));
          console.error(
            "[net] Replace keys:",
            Array.from(replaceKeys).join(", ")
          );
          console.error("[net] Has avatars in patch:", p.avatars !== undefined);
          console.error(
            "[net] Has permanents in patch:",
            p.permanents !== undefined
          );
          // Log the actual patch for debugging
          try {
            console.error(
              "[net] Patch content:",
              JSON.stringify(p, null, 2).slice(0, 2000)
            );
          } catch {
            console.error("[net] Could not stringify patch");
          }
        }
      } catch (err) {
        console.error("[net] Error in state loss detection:", err);
      }
      if (shouldClearSnapshots) {
        try {
          clearSnapshotsStorageFor(get().matchId ?? null);
        } catch {}
        (result as GameState).snapshots = [] as GameState["snapshots"];
      }
      return result;
    }),

  applyPatch: (patch) =>
    set((state) => {
      if (!patch || typeof patch !== "object") return state as GameState;

      const p = patch as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : (deepMergeReplaceArrays(
              state.players,
              p.players
            ) as GameState["players"]);
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
              p.board
            ) as GameState["board"]);
      }
      if (p.zones !== undefined) {
        next.zones = replaceKeys.has("zones")
          ? (p.zones as GameState["zones"])
          : (deepMergeReplaceArrays(
              state.zones,
              p.zones
            ) as GameState["zones"]);
      }
      if (p.avatars !== undefined) {
        next.avatars = replaceKeys.has("avatars")
          ? (p.avatars as GameState["avatars"])
          : (deepMergeReplaceArrays(
              state.avatars,
              p.avatars
            ) as GameState["avatars"]);
      }
      if (p.permanents !== undefined) {
        if (replaceKeys.has("permanents")) {
          next.permanents = normalizePermanentsRecord(
            (p.permanents as Permanents) || ({} as Permanents)
          ) as GameState["permanents"];
        } else {
          const merged = mergePermanentsMap(state.permanents, p.permanents);
          next.permanents = normalizePermanentsRecord(
            merged as Permanents
          ) as GameState["permanents"];
        }
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? (p.mulligans as GameState["mulligans"])
          : (deepMergeReplaceArrays(
              state.mulligans,
              p.mulligans
            ) as GameState["mulligans"]);
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? (p.mulliganDrawn as GameState["mulliganDrawn"])
          : (deepMergeReplaceArrays(
              state.mulliganDrawn,
              p.mulliganDrawn
            ) as GameState["mulliganDrawn"]);
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : (deepMergeReplaceArrays(
              state.permanentPositions,
              p.permanentPositions
            ) as GameState["permanentPositions"]);
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : (deepMergeReplaceArrays(
              state.permanentAbilities,
              p.permanentAbilities
            ) as GameState["permanentAbilities"]);
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : (deepMergeReplaceArrays(
              state.sitePositions,
              p.sitePositions
            ) as GameState["sitePositions"]);
      }
      if (p.playerPositions !== undefined) {
        next.playerPositions = replaceKeys.has("playerPositions")
          ? (p.playerPositions as GameState["playerPositions"])
          : (deepMergeReplaceArrays(
              state.playerPositions,
              p.playerPositions
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
                  0
                );
        } else {
          const merged = mergeEvents(
            state.events,
            (p.events as GameState["events"]) || []
          );
          next.events = merged;
          const mergedMaxId = merged.reduce(
            (mx, e) => Math.max(mx, Number(e.id) || 0),
            0
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
      // Druid flipped state - applyPatch version
      if (p.druidFlipped !== undefined) {
        next.druidFlipped = p.druidFlipped;
      }

      // CRITICAL: Spread state first, then next - otherwise we lose all state not in the patch
      return {
        ...state,
        ...next,
      } as Partial<GameState> as GameState;
    }),
});
