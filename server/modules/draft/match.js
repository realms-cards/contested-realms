"use strict";

/**
 * Match-level Draft Service
 *
 * Encapsulates draft state transitions, readiness handling, pack generation,
 * and presence tracking for draft sessions. Extracted from the legacy
 * server/index monolith as part of the modularization effort.
 *
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io
 * @param {import('ioredis')|null} deps.storeRedis
 * @param {import('@prisma/client').PrismaClient} deps.prisma
 * @param {object} deps.draftConfig - Draft configuration service
 * @param {Function} deps.hydrateMatchFromDatabase
 * @param {Function} deps.persistMatchUpdate
 * @param {Function} deps.getOrLoadMatch
 * @param {Function} deps.getMatchInfo
 * @param {Function} deps.createRngFromString
 * @param {Function} deps.generateBoosterDeterministic
 * @param {Function} [deps.generateCubeBoosterDeterministic]
 * @returns {object}
 */
function createMatchDraftService({
  io,
  storeRedis,
  prisma,
  draftConfig,
  hydrateMatchFromDatabase,
  persistMatchUpdate,
  getOrLoadMatch,
  getMatchInfo,
  createRngFromString,
  generateBoosterDeterministic,
  generateCubeBoosterDeterministic,
}) {
  if (!io) throw new Error("createMatchDraftService requires io");
  if (!prisma) throw new Error("createMatchDraftService requires prisma");
  if (!draftConfig) throw new Error("createMatchDraftService requires draftConfig service");
  if (typeof hydrateMatchFromDatabase !== "function") {
    throw new Error("createMatchDraftService requires hydrateMatchFromDatabase");
  }
  if (typeof persistMatchUpdate !== "function") {
    throw new Error("createMatchDraftService requires persistMatchUpdate");
  }
  if (typeof getOrLoadMatch !== "function") {
    throw new Error("createMatchDraftService requires getOrLoadMatch");
  }
  if (typeof getMatchInfo !== "function") {
    throw new Error("createMatchDraftService requires getMatchInfo");
  }
  if (typeof createRngFromString !== "function") {
    throw new Error("createMatchDraftService requires createRngFromString");
  }
  if (typeof generateBoosterDeterministic !== "function") {
    throw new Error("createMatchDraftService requires generateBoosterDeterministic");
  }

  const draftStartWatchdogs = new Map();
  const draftPresence = new Map();

  function getDraftPresenceList(sessionId) {
    const map = draftPresence.get(sessionId);
    if (!map) return [];
    return Array.from(map.values());
  }

  function upsertDraftPresence(sessionId, playerId, playerName, isConnected) {
    let map = draftPresence.get(sessionId);
    if (!map) {
      map = new Map();
      draftPresence.set(sessionId, map);
    }
    const prev =
      map.get(playerId) || {
        playerId,
        playerName: playerName || `Player ${String(playerId).slice(-4)}`,
        isConnected: false,
        lastActivity: 0,
      };
    const record = {
      playerId,
      playerName: playerName || prev.playerName,
      isConnected: !!isConnected,
      lastActivity: Date.now(),
    };
    map.set(playerId, record);
    return getDraftPresenceList(sessionId);
  }

  /**
   * Cluster-wide draft presence tracking using Redis when available.
   * Falls back to process-local map on failure.
   */
  async function updateDraftPresence(sessionId, playerId, playerName, isConnected) {
    if (storeRedis) {
      try {
        const countsKey = `draft:presence:counts:${sessionId}`;
        const namesKey = `draft:presence:names:${sessionId}`;
        const stateKey = `draft:presence:state:${sessionId}`;
        if (playerName) {
          await storeRedis.hset(namesKey, playerId, playerName);
        }
        if (isConnected === true) {
          await storeRedis.hincrby(countsKey, playerId, 1);
        } else if (isConnected === false) {
          await storeRedis.hincrby(countsKey, playerId, -1);
        }
        const rawCount = await storeRedis.hget(countsKey, playerId);
        let count = Number(rawCount || 0);
        if (!Number.isFinite(count) || count < 0) count = 0;
        const resolvedName =
          (await storeRedis.hget(namesKey, playerId)) ||
          playerName ||
          `Player ${String(playerId).slice(-4)}`;
        const record = {
          playerId,
          playerName: resolvedName,
          isConnected: count > 0,
          lastActivity: Date.now(),
        };
        await storeRedis.hset(stateKey, playerId, JSON.stringify(record));
        const raw = await storeRedis.hgetall(stateKey);
        const list = [];
        for (const key of Object.keys(raw || {})) {
          try {
            list.push(JSON.parse(raw[key]));
          } catch {
            // ignore malformed entries
          }
        }
        return list;
      } catch (err) {
        try {
          console.warn("[draft] redis presence update failed:", err?.message || err);
        } catch {
          // noop
        }
      }
    }
    return upsertDraftPresence(sessionId, playerId, playerName, isConnected);
  }

  function clearDraftWatchdog(matchId) {
    const timer = draftStartWatchdogs.get(matchId);
    if (timer) {
      try {
        clearTimeout(timer);
      } catch {
        // ignore
      }
      draftStartWatchdogs.delete(matchId);
    }
  }

  function repairDraftInvariants(match) {
    if (!match || match.matchType !== "draft" || !match.draftState) return;
    const state = match.draftState;
    if (state.phase === "picking" && Number(state.pickNumber || 0) === 1) {
      const hasAnyCards = Array.isArray(state.currentPacks)
        ? state.currentPacks.some((pack) => Array.isArray(pack) && pack.length > 0)
        : false;
      if (!hasAnyCards) {
        state.phase = "pack_selection";
        state.waitingFor = [...match.playerIds];
        if (!Array.isArray(state.packChoice) || state.packChoice.length !== match.playerIds.length) {
          state.packChoice = Array.from({ length: match.playerIds.length }, () => null);
        } else {
          state.packChoice = state.packChoice.map(() => null);
        }
        try {
          console.warn(
            "[Draft] Repaired invariant: picking@1 without packs -> reverted to pack_selection",
            { matchId: match.id, round: state.packIndex + 1 }
          );
        } catch {
          // ignore logging failure
        }
      }
    }
    const maxPacks = (match.draftConfig && Number(match.draftConfig.packCount)) || 3;
    if (typeof state.packIndex === "number" && state.packIndex >= maxPacks) {
      state.packIndex = Math.max(0, maxPacks - 1);
    }
  }

  async function leaderDraftPlayerReady(matchId, playerId, ready) {
    const match = await getOrLoadMatch(matchId);
    if (!match || match.matchType !== "draft" || !match.draftState) return;
    const seatIndex = Array.isArray(match.playerIds) ? match.playerIds.indexOf(playerId) : -1;
    if (seatIndex === -1) return;
    if (!match.draftState.playerReady || typeof match.draftState.playerReady !== "object") {
      match.draftState.playerReady = { p1: false, p2: false };
    }
    if (!ready) {
      return;
    }
    const playerKey = seatIndex === 1 ? "p2" : "p1";
    match.draftState.playerReady[playerKey] = true;
    io.to(`match:${matchId}`).emit("message", {
      type: "playerReady",
      playerKey,
      ready: true,
    });
    const readyState = match.draftState.playerReady;
    if (match.draftState.phase === "waiting" && readyState.p1 === true && readyState.p2 === true) {
      try {
        await leaderStartDraft(matchId, playerId);
      } catch (err) {
        try {
          console.warn("[Draft] auto-start failed:", err?.message || err);
        } catch {
          // ignore
        }
      }
      clearDraftWatchdog(matchId);
      const timer = setTimeout(async () => {
        try {
          const resync = await getOrLoadMatch(matchId);
          if (
            resync &&
            resync.matchType === "draft" &&
            resync.draftState &&
            resync.draftState.phase === "waiting" &&
            resync.draftState.playerReady?.p1 === true &&
            resync.draftState.playerReady?.p2 === true &&
            !resync.draftState.__startingDraft
          ) {
            await leaderStartDraft(matchId, playerId);
          }
        } catch {
          // ignore second attempt failure
        } finally {
          clearDraftWatchdog(matchId);
        }
      }, 1500);
      draftStartWatchdogs.set(matchId, timer);
    }
    try {
      await persistMatchUpdate(match, null, playerId, Date.now());
    } catch {
      // noop
    }
  }

  async function leaderStartDraft(matchId, requestingPlayerId = null, overrideConfig = null, requestingSocketId = null) {
    const match = await getOrLoadMatch(matchId);
    if (!match || match.matchType !== "draft" || !match.draftState) return;
    if (match.draftState.phase !== "waiting") return;
    if (match.draftState.__startingDraft) return;
    match.draftState.__startingDraft = true;

    if (match.tournamentId && match.matchType === "draft") {
      try {
        await draftConfig.ensureConfigLoaded(prisma, matchId, match, hydrateMatchFromDatabase);
      } catch (err) {
        try {
          console.warn("[Draft] Failed to ensure config loaded:", err?.message || err);
        } catch {
          // ignore logging failure
        }
      }
    }

    const room = `match:${match.id}`;
    let config;
    try {
      config = await draftConfig.getDraftConfig(prisma, matchId, match);
    } catch (err) {
      try {
        console.warn("[Draft] Failed to get draft config, using default:", err?.message || err);
      } catch {
        // ignore logging failure
      }
      config = { setMix: ["Beta"], packCount: 3, packSize: 15 };
    }

    if (overrideConfig && typeof overrideConfig === "object") {
      config = { ...config, ...overrideConfig };
    }

    const usingCube = Boolean(config.cubeId);
    const setMix = Array.isArray(config.setMix) && config.setMix.length > 0 ? config.setMix : ["Beta"];
    const packCount = Math.max(1, Number(config.packCount) || 3);
    const packSize = Math.max(8, Number(config.packSize) || 15);
    let packCounts =
      config && typeof config.packCounts === "object" ? { ...config.packCounts } : undefined;

    if (!usingCube) {
      const sum = (obj) =>
        obj ? Object.values(obj).reduce((acc, value) => acc + Math.max(0, Number(value) || 0), 0) : 0;
      if (!packCounts || sum(packCounts) !== packCount) {
        const counts = {};
        const n = setMix.length;
        for (const entry of setMix) counts[entry] = 0;
        const base = Math.floor(packCount / n);
        const remainder = packCount % n;
        setMix.forEach((entry, idx) => {
          counts[entry] = base + (idx < remainder ? 1 : 0);
        });
        packCounts = counts;
      }
    }

    match.draftConfig = { ...config, setMix, packCount, packSize, packCounts };

    try {
      const packSequence = [];
      if (!usingCube) {
        if (packCounts && typeof packCounts === "object") {
          for (const [setName, count] of Object.entries(packCounts)) {
            const normalized = Math.max(0, Number(count) || 0);
            for (let i = 0; i < normalized; i++) {
              packSequence.push(setName);
            }
          }
        }
        if (packSequence.length !== packCount) {
          const message = `Draft configuration error: pack counts must sum to ${packCount}`;
          try {
            console.error(
              "[Draft] packCounts sum mismatch",
              { packSequenceLength: packSequence.length, packCount }
            );
          } catch {
            // ignore logging failure
          }
          if (requestingSocketId) {
            try {
              io.to(requestingSocketId).emit("error", { message });
            } catch {
              // ignore
            }
          }
          return;
        }
      }

      const currentPacks = [];
      for (let playerIdx = 0; playerIdx < match.playerIds.length; playerIdx++) {
        const playerPacks = [];
        for (let packIdx = 0; packIdx < packCount; packIdx++) {
          const rng = createRngFromString(
            `${match.seed}|${match.playerIds[playerIdx]}|draft|${packIdx}`
          );
          let picks;
          let setName = "Beta";
          if (usingCube) {
            if (typeof generateCubeBoosterDeterministic === "function") {
              picks = await generateCubeBoosterDeterministic(config.cubeId, rng, packSize);
            } else {
              throw new Error("Cube draft requested but generateCubeBoosterDeterministic unavailable");
            }
          } else {
            setName = packSequence[packIdx] || (setMix.length > 0 ? setMix[0] : "Beta");
            picks = await generateBoosterDeterministic(setName, rng, false);
          }
          const cards = picks.slice(0, packSize).map((card, cardIdx) => ({
            id: `${String(card.variantId)}_${packIdx}_${cardIdx}_${match.playerIds[playerIdx].slice(
              -4
            )}`,
            name: card.cardName || "",
            slug: String(card.slug || ""),
            type: card.type || null,
            cost: String(card.cost || ""),
            rarity: card.rarity || "common",
            element: card.element || [],
            setName: usingCube ? card.setName || "Unknown" : setName,
          }));
          playerPacks.push(cards);
        }
        currentPacks.push(playerPacks);
      }

      if (!Array.isArray(match.draftState.packChoice) || match.draftState.packChoice.length !== match.playerIds.length) {
        match.draftState.packChoice = Array.from({ length: match.playerIds.length }, () => null);
      } else {
        match.draftState.packChoice = match.draftState.packChoice.map(() => null);
      }
      if (!Array.isArray(match.draftState.picks) || match.draftState.picks.length !== match.playerIds.length) {
        match.draftState.picks = Array.from({ length: match.playerIds.length }, () => []);
      }

      match.draftState.phase = "pack_selection";
      match.draftState.allGeneratedPacks = currentPacks;
      match.draftState.currentPacks = [];
      match.draftState.waitingFor = [...match.playerIds];

      try {
        repairDraftInvariants(match);
      } catch {
        // ignore invariant repair failure
      }
      io.to(room).emit("draftUpdate", match.draftState);
      if (requestingSocketId) {
        try {
          io.to(requestingSocketId).emit("draftUpdate", match.draftState);
        } catch {
          // ignore
        }
      }
      try {
        io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
      } catch {
        // ignore
      }
      clearDraftWatchdog(match.id);
      try {
        await persistMatchUpdate(match, null, requestingPlayerId || "system", Date.now());
      } catch {
        // ignore persist failure
      }
    } catch (err) {
      try {
        console.error("[Draft] Error starting draft:", err?.message || err);
      } catch {
        // ignore logging failure
      }
      if (requestingSocketId) {
        try {
          io.to(requestingSocketId).emit("error", { message: "Failed to start draft" });
        } catch {
          // ignore
        }
      }
    } finally {
      match.draftState.__startingDraft = false;
    }
  }

  async function leaderMakeDraftPick(matchId, playerId, { cardId, packIndex, pickNumber }) {
    const match = await getOrLoadMatch(matchId);
    if (!match || match.matchType !== "draft" || !match.draftState) return;
    const state = match.draftState;
    if (state.phase !== "picking") return;
    if (state.packIndex !== packIndex || state.pickNumber !== pickNumber) return;
    if (!state.waitingFor.includes(playerId)) return;
    const playerIndex = match.playerIds.indexOf(playerId);
    if (playerIndex === -1) return;
    const currentPack = state.currentPacks[playerIndex];
    if (!currentPack) return;
    const cardIdx = currentPack.findIndex((card) => card.id === cardId);
    if (cardIdx === -1) return;
    const pickedCard = currentPack.splice(cardIdx, 1)[0];
    state.picks[playerIndex].push(pickedCard);
    state.waitingFor = state.waitingFor.filter((id) => id !== playerId);

    if (state.waitingFor.length === 0) {
      if (state.pickNumber >= 15 || currentPack.length === 0) {
        state.packIndex++;
        state.pickNumber = 1;
        const maxPacks = (match.draftConfig && Number(match.draftConfig.packCount)) || 3;
        if (state.packIndex >= maxPacks) {
          state.phase = "complete";
          match.status = "deck_construction";
        } else {
          state.pickNumber = 1;
          state.packDirection = state.packDirection === "left" ? "right" : "left";
          state.phase = "pack_selection";
          state.waitingFor = [...match.playerIds];
          state.currentPacks = [];
          if (!Array.isArray(state.packChoice) || state.packChoice.length !== match.playerIds.length) {
            state.packChoice = Array.from({ length: match.playerIds.length }, () => null);
          } else {
            state.packChoice = state.packChoice.map(() => null);
          }
          try {
            console.log(`[Draft] Enter pack_selection for round ${state.packIndex + 1}`);
          } catch {
            // ignore logging failure
          }
        }
      } else {
        state.pickNumber++;
        state.phase = "passing";
        const temp = [...state.currentPacks];
        const count = temp.length;
        if (state.packDirection === "left") {
          for (let i = 0; i < count; i++) {
            state.currentPacks[(i + 1) % count] = temp[i];
          }
        } else {
          for (let i = 0; i < count; i++) {
            state.currentPacks[(i - 1 + count) % count] = temp[i];
          }
        }
        state.phase = "picking";
        state.waitingFor = [...match.playerIds];
      }
    }

    try {
      repairDraftInvariants(match);
    } catch {
      // ignore
    }
    io.to(`match:${match.id}`).emit("draftUpdate", state);
    try {
      await persistMatchUpdate(match, null, playerId, Date.now());
    } catch {
      // ignore persist failure
    }
  }

  async function leaderChooseDraftPack(matchId, playerId, { setChoice, packIndex }) {
    const match = await getOrLoadMatch(matchId);
    if (!match || match.matchType !== "draft" || !match.draftState) return;
    const state = match.draftState;
    const playerIndex = match.playerIds.indexOf(playerId);
    if (playerIndex === -1) return;
    if (state.phase !== "pack_selection") return;
    if (state.packChoice[playerIndex] !== null) return;
    const chosenIdx = Math.max(0, Number(packIndex) || 0);
    const roundIdx = Math.max(0, Number(state.packIndex) || 0);
    const playerPacks = Array.isArray(state.allGeneratedPacks?.[playerIndex])
      ? state.allGeneratedPacks[playerIndex]
      : [];
    if (
      Array.isArray(playerPacks) &&
      chosenIdx >= 0 &&
      chosenIdx < playerPacks.length &&
      roundIdx >= 0 &&
      roundIdx < playerPacks.length &&
      chosenIdx !== roundIdx
    ) {
      const tmp = playerPacks[roundIdx];
      playerPacks[roundIdx] = playerPacks[chosenIdx];
      playerPacks[chosenIdx] = tmp;
    }
    state.packChoice[playerIndex] = setChoice;
    const allChoices = state.packChoice.every((choice) => choice !== null);
    if (allChoices && state.phase === "pack_selection") {
      state.currentPacks = state.allGeneratedPacks.map((packs) =>
        packs[state.packIndex] ? [...packs[state.packIndex]] : []
      );
      state.phase = "picking";
      state.waitingFor = [...match.playerIds];
      try {
        console.log(
          `[Draft] All pack choices resolved for round ${state.packIndex + 1}. Enter picking.`
        );
      } catch {
        // ignore logging failure
      }
    }
    try {
      repairDraftInvariants(match);
    } catch {
      // ignore
    }
    io.to(`match:${match.id}`).emit("draftUpdate", state);
    try {
      await persistMatchUpdate(match, null, playerId, Date.now());
    } catch {
      // ignore
    }
  }

  return {
    repairDraftInvariants,
    leaderDraftPlayerReady,
    leaderStartDraft,
    leaderMakeDraftPick,
    leaderChooseDraftPack,
    updateDraftPresence,
    getDraftPresenceList,
    clearDraftWatchdog,
  };
}

module.exports = {
  createMatchDraftService,
};
