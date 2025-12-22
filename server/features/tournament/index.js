// Tournament feature module: presence tracking, broadcasts, and Socket.IO handlers.

/**
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io
 * @param {import('ioredis')} [deps.storeRedis]
 * @param {string} deps.instanceId
 * @param {Map<string, any>} deps.players
 * @param {Map<string, any>} deps.matches
 * @param {Map<string, string>} deps.playerIdBySocket
 * @param {import('@prisma/client').PrismaClient} deps.prisma
 * @param {(prefix: string) => string} deps.rid
 * @param {(config: any) => any} deps.normalizeSealedConfig
 * @param {Function} deps.createRngFromString
 * @param {Function} deps.generateBoosterDeterministic
 * @param {(match: any) => Promise<void>} deps.persistMatchCreated
 * @param {(matchId: string, match: any) => Promise<void>} deps.hydrateMatchFromDatabase
 * @param {(match: any) => void} deps.startMatchRecording
 * @param {(match: any) => any} deps.getMatchInfo
 * @param {import('../../modules/tournament/broadcast')} deps.tournamentBroadcast
 */
function createTournamentFeature(deps) {
  const io = deps.io;
  const storeRedis = deps.storeRedis || null;
  const INSTANCE_ID = deps.instanceId;
  const players = deps.players;
  const matches = deps.matches;
  const playerIdBySocket = deps.playerIdBySocket;
  const prisma = deps.prisma;
  const normalizeSealedConfig = deps.normalizeSealedConfig;
  const createRngFromString = deps.createRngFromString;
  const generateBoosterDeterministic = deps.generateBoosterDeterministic;
  const persistMatchCreated = deps.persistMatchCreated;
  const hydrateMatchFromDatabase = deps.hydrateMatchFromDatabase;
  const startMatchRecording = deps.startMatchRecording;
  const getMatchInfo = deps.getMatchInfo;
  const tournamentBroadcast = deps.tournamentBroadcast;
  const EVENT_NAME_ALIASES = {
    "tournament:updated": "TOURNAMENT_UPDATED",
    "tournament:phase:changed": "PHASE_CHANGED",
    "tournament:round:started": "ROUND_STARTED",
    "tournament:match:assigned": "MATCH_ASSIGNED",
    "tournament:statistics:updated": "STATISTICS_UPDATED",
    "tournament:player:joined": "PLAYER_JOINED",
    "tournament:player:left": "PLAYER_LEFT",
    "tournament:draft:ready": "DRAFT_READY",
    "tournament:preparation:update": "UPDATE_PREPARATION",
    "tournament:error": "TOURNAMENT_ERROR",
  };
  const SNAPSHOT_EVENT_NAMES = new Set([
    "tournament:updated",
    "tournament:phase:changed",
    "tournament:round:started",
    "tournament:statistics:updated",
    "tournament:draft:ready",
    "tournament:preparation:update",
    "tournament:presence",
  ]);
  /** @type {Map<string, Map<string, any>>} tournamentId -> Map<eventName, payload> */
  const tournamentSnapshots = new Map();

  function clonePayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    try {
      return structuredClone(payload);
    } catch {
      try {
        return JSON.parse(JSON.stringify(payload));
      } catch {
        return payload;
      }
    }
  }

  function setSnapshot(tournamentId, eventName, payload) {
    if (!SNAPSHOT_EVENT_NAMES.has(eventName)) return;
    let eventMap = tournamentSnapshots.get(tournamentId);
    if (!eventMap) {
      eventMap = new Map();
      tournamentSnapshots.set(tournamentId, eventMap);
    }
    eventMap.set(eventName, clonePayload(payload));
  }

  function emitToSocket(socketInstance, eventName, payload, opts = {}) {
    const includeLegacy = opts.includeLegacy !== false;
    try {
      socketInstance.emit(eventName, payload);
      if (includeLegacy && EVENT_NAME_ALIASES[eventName]) {
        socketInstance.emit(EVENT_NAME_ALIASES[eventName], payload);
      }
    } catch (err) {
      console.warn(
        "[Tournament] Failed to emit to socket:",
        err?.message || err
      );
    }
  }

  function emitToTournamentRoom(tournamentId, eventName, payload, opts = {}) {
    const skipLegacy = opts.skipLegacy === true;
    const skipSnapshot = opts.skipSnapshot === true;
    const room = `tournament:${tournamentId}`;
    try {
      io.to(room).emit(eventName, payload);
      if (!skipLegacy && EVENT_NAME_ALIASES[eventName]) {
        io.to(room).emit(EVENT_NAME_ALIASES[eventName], payload);
      }
    } catch (err) {
      console.warn(
        "[Tournament] Failed to emit event:",
        eventName,
        err?.message || err
      );
    }
    if (!skipSnapshot) {
      setSnapshot(tournamentId, eventName, payload);
    }
  }

  function replaySnapshotsForSocket(socketInstance, tournamentId) {
    const eventMap = tournamentSnapshots.get(tournamentId);
    if (!eventMap || eventMap.size === 0) return false;
    for (const [eventName, payload] of eventMap.entries()) {
      emitToSocket(socketInstance, eventName, payload);
    }
    return true;
  }

  async function loadAndSendInitialSnapshot(socketInstance, tournamentId) {
    const sent = replaySnapshotsForSocket(socketInstance, tournamentId);
    if (sent) return;
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          registrations: {
            include: {
              player: { select: { id: true, name: true, shortId: true } },
            },
          },
        },
      });
      if (!tournament) return;
      const registeredPlayers = Array.isArray(tournament.registrations)
        ? tournament.registrations.map((registration) => ({
            id: registration.playerId,
            displayName:
              registration.player?.name ||
              registration.player?.shortId ||
              registration.playerId,
            preparationStatus: registration.preparationStatus,
            deckSubmitted: registration.deckSubmitted,
            seatStatus: registration.seatStatus,
          }))
        : [];
      const activeCount = Array.isArray(tournament.registrations)
        ? tournament.registrations.filter(
            (registration) => registration.seatStatus !== "vacant"
          ).length
        : 0;
      const payload = {
        id: tournament.id,
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        maxPlayers: tournament.maxPlayers,
        currentPlayers: activeCount,
        creatorId: tournament.creatorId,
        settings: tournament.settings,
        createdAt: tournament.createdAt?.toISOString?.() || null,
        startedAt: tournament.startedAt?.toISOString?.() || null,
        completedAt: tournament.completedAt?.toISOString?.() || null,
        registeredPlayers,
      };
      setSnapshot(tournamentId, "tournament:updated", payload);
      emitToSocket(socketInstance, "tournament:updated", payload);
    } catch (err) {
      console.warn(
        "[Tournament] Failed to load initial snapshot:",
        err?.message || err
      );
    }
  }

  /** @type {Map<string, Map<string, { playerId: string, playerName: string|null, isConnected: boolean, lastActivity: number }>>} */
  const tournamentPresence = new Map();
  function emitTournamentPresence(tournamentId, playersList) {
    const payload = {
      tournamentId,
      players: playersList,
    };
    emitToTournamentRoom(tournamentId, "tournament:presence", payload, {
      skipLegacy: true,
    });
  }

  function getTournamentPresenceList(tournamentId) {
    const m = tournamentPresence.get(tournamentId);
    if (!m) return [];
    return Array.from(m.values());
  }

  function upsertTournamentPresence(
    tournamentId,
    playerId,
    playerName,
    isConnected
  ) {
    let m = tournamentPresence.get(tournamentId);
    if (!m) {
      m = new Map();
      tournamentPresence.set(tournamentId, m);
    }
    const prev = m.get(playerId) || {
      playerId,
      playerName: playerName || `Player ${String(playerId).slice(-4)}`,
      isConnected: false,
      lastActivity: 0,
    };
    const rec = {
      playerId,
      playerName: playerName || prev.playerName,
      isConnected: !!isConnected,
      lastActivity: Date.now(),
    };
    m.set(playerId, rec);
    return getTournamentPresenceList(tournamentId);
  }

  function broadcastTournamentUpdate(tournamentId, data) {
    tournamentBroadcast.emitTournamentUpdate(io, tournamentId, data);
    emitToTournamentRoom(tournamentId, "tournament:updated", data, {
      skipLegacy: true,
    });
  }

  function broadcastPhaseChanged(tournamentId, newPhase, additionalData = {}) {
    const payload = {
      tournamentId,
      newPhase,
      newStatus: newPhase,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };
    if (typeof payload.newStatus !== "string") {
      payload.newStatus = newPhase;
    }
    tournamentBroadcast.emitPhaseChanged(
      io,
      tournamentId,
      newPhase,
      additionalData
    );
    emitToTournamentRoom(tournamentId, "tournament:phase:changed", payload, {
      skipLegacy: true,
    });
  }

  function broadcastRoundStarted(tournamentId, roundNumber, roundMatches) {
    tournamentBroadcast.emitRoundStarted(
      io,
      tournamentId,
      roundNumber,
      roundMatches
    );
    emitToTournamentRoom(
      tournamentId,
      "tournament:round:started",
      {
        tournamentId,
        roundNumber,
        matches: roundMatches,
      },
      { skipLegacy: true }
    );
  }

  function broadcastPlayerJoined(
    tournamentId,
    playerId,
    playerName,
    currentPlayerCount
  ) {
    tournamentBroadcast.emitPlayerJoined(
      io,
      tournamentId,
      playerId,
      playerName,
      currentPlayerCount
    );
    emitToTournamentRoom(
      tournamentId,
      "tournament:player:joined",
      {
        tournamentId,
        playerId,
        playerName,
        currentPlayerCount,
      },
      { skipLegacy: true, skipSnapshot: true }
    );
  }

  function broadcastPlayerLeft(
    tournamentId,
    playerId,
    playerName,
    currentPlayerCount
  ) {
    tournamentBroadcast.emitPlayerLeft(
      io,
      tournamentId,
      playerId,
      playerName,
      currentPlayerCount
    );
    emitToTournamentRoom(
      tournamentId,
      "tournament:player:left",
      {
        tournamentId,
        playerId,
        playerName,
        currentPlayerCount,
      },
      { skipLegacy: true, skipSnapshot: true }
    );
  }

  function broadcastPreparationUpdate(
    tournamentId,
    playerId,
    preparationStatus,
    readyPlayerCount,
    totalPlayerCount,
    deckSubmitted = false
  ) {
    tournamentBroadcast.emitPreparationUpdate(
      io,
      tournamentId,
      playerId,
      preparationStatus,
      readyPlayerCount,
      totalPlayerCount,
      deckSubmitted
    );
    emitToTournamentRoom(
      tournamentId,
      "tournament:preparation:update",
      {
        tournamentId,
        playerId,
        preparationStatus,
        readyPlayerCount,
        totalPlayerCount,
        deckSubmitted,
      },
      { skipLegacy: true }
    );
  }

  function broadcastDraftReady(tournamentId, payload) {
    tournamentBroadcast.emitDraftReady(io, tournamentId, payload);
    emitToTournamentRoom(
      tournamentId,
      "tournament:draft:ready",
      {
        tournamentId,
        ...payload,
      },
      { skipLegacy: true }
    );
  }

  function broadcastStatisticsUpdate(tournamentId, statistics) {
    tournamentBroadcast.emitStatisticsUpdate(io, tournamentId, statistics);
    emitToTournamentRoom(
      tournamentId,
      "tournament:statistics:updated",
      {
        tournamentId,
        ...statistics,
      },
      { skipLegacy: true }
    );
  }

  function registerSocketHandlers({ socket, isAuthed, getPlayerBySocket }) {
    /** @type {Set<string>} */
    const currentTournamentIds = new Set();

    socket.on("tournament:join", async (payload) => {
      const tournamentId = payload?.tournamentId;
      if (!tournamentId) return;
      // Idempotency guard: if this socket already joined, acknowledge and skip
      if (currentTournamentIds.has(tournamentId)) {
        try {
          socket.emit("tournament:joined", { tournamentId });
        } catch {}
        return;
      }

      console.log(
        `[Tournament] Player ${socket.id} joining tournament room: tournament:${tournamentId}`
      );
      await socket.join(`tournament:${tournamentId}`);
      currentTournamentIds.add(tournamentId);

      try {
        socket.emit("tournament:joined", { tournamentId });
      } catch (err) {
        console.error("[Tournament] Error sending join acknowledgment:", err);
      }

      try {
        const player = getPlayerBySocket(socket);
        const pid = player?.id || playerIdBySocket.get(socket.id);
        const name = player?.displayName || null;
        if (pid) {
          const list = upsertTournamentPresence(tournamentId, pid, name, true);
          emitTournamentPresence(tournamentId, list);
        }
      } catch {}

      await loadAndSendInitialSnapshot(socket, tournamentId);
    });

    socket.on("tournament:leave", async (payload) => {
      const tournamentId = payload?.tournamentId;
      if (!tournamentId) return;

      console.log(
        `[Tournament] Player ${socket.id} leaving tournament room: tournament:${tournamentId}`
      );
      await socket.leave(`tournament:${tournamentId}`);
      try {
        currentTournamentIds.delete(tournamentId);
      } catch {}

      try {
        socket.emit("tournament:left", { tournamentId });
      } catch (err) {
        console.error("[Tournament] Error sending leave acknowledgment:", err);
      }

      try {
        const pid = playerIdBySocket.get(socket.id);
        if (pid) {
          const list = upsertTournamentPresence(
            tournamentId,
            pid,
            players.get(pid)?.displayName || null,
            false
          );
          emitTournamentPresence(tournamentId, list);
        }
      } catch {}
    });

    socket.on("TOURNAMENT_CHAT", async (payload) => {
      const tournamentId = payload?.tournamentId;
      const content = payload?.content;
      const timestamp = payload?.timestamp || Date.now();
      if (!tournamentId || !content) return;

      const player = getPlayerBySocket(socket);
      const from = player?.displayName || "Anonymous";

      console.log(`[Tournament Chat] ${from} in ${tournamentId}: ${content}`);

      io.to(`tournament:${tournamentId}`).emit("TOURNAMENT_CHAT", {
        tournamentId,
        from,
        content,
        timestamp,
      });
    });

    socket.on("startTournamentMatch", async (payload = {}) => {
      if (!isAuthed()) return;
      const matchId =
        typeof payload?.matchId === "string" ? payload.matchId : null;
      const playerIds = Array.isArray(payload?.playerIds)
        ? payload.playerIds.filter(Boolean).map(String)
        : [];
      const requestedMatchType = payload?.matchType || "constructed";
      const lobbyName = payload?.lobbyName || null;
      const tournamentId = payload?.tournamentId
        ? String(payload.tournamentId)
        : null;
      const sealedConfig = payload?.sealedConfig || null;
      if (!matchId || playerIds.length < 1) return;

      const actualMatchType =
        requestedMatchType === "sealed" ? "sealed" : "constructed";
      const normalizedSealedConfig =
        actualMatchType === "sealed"
          ? (() => {
              const base = normalizeSealedConfig(sealedConfig || {});
              if (base && !base.constructionStartTime)
                base.constructionStartTime = Date.now();
              return base;
            })()
          : null;

      let match = matches.get(matchId);
      if (!match) {
        match = {
          id: matchId,
          lobbyId: null,
          lobbyName,
          tournamentId,
          playerIds: [...new Set(playerIds)],
          status:
            actualMatchType === "sealed" ? "deck_construction" : "waiting",
          seed: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          turn: playerIds[0] || null,
          winnerId: null,
          matchType: actualMatchType,
          sealedConfig: normalizedSealedConfig,
          playerDecks: new Map(),
          game: {
            phase: "Setup",
            mulligans: { p1: 1, p2: 1 },
            d20Rolls: { p1: null, p2: null },
            setupWinner: null,
          },
          lastTs: 0,
          interactionRequests: new Map(),
          interactionGrants: new Map(),
        };

        matches.set(matchId, match);
        try {
          if (storeRedis) {
            await storeRedis.set(
              `match:leader:${match.id}`,
              INSTANCE_ID,
              "NX",
              "EX",
              60
            );
          }
        } catch {}
        try {
          await persistMatchCreated(match);
        } catch {}
        startMatchRecording(match);
        await hydrateMatchFromDatabase(matchId, match);
      } else {
        for (const pid of playerIds) {
          if (!match.playerIds.includes(pid)) match.playerIds.push(pid);
        }
        if (!match.tournamentId && tournamentId)
          match.tournamentId = tournamentId;
        if (!match.playerDecks || !(match.playerDecks instanceof Map)) {
          match.playerDecks = new Map();
        }
        if (actualMatchType === "sealed") {
          match.sealedConfig =
            normalizedSealedConfig || normalizeSealedConfig(match.sealedConfig);
        }
        await hydrateMatchFromDatabase(matchId, match);
      }

      const room = `match:${match.id}`;
      for (const pid of playerIds) {
        const p = players.get(pid);
        if (!p) continue;
        p.matchId = match.id;
        const sid = p.socketId || null;
        if (sid) {
          try {
            await io.in(sid).socketsJoin(room);
          } catch {}
        }
      }

      if (match.matchType === "sealed" && match.sealedConfig) {
        (async () => {
          try {
            const sealedPacks = {};
            for (const pid of match.playerIds) {
              const rng = createRngFromString(`${match.seed}|${pid}|sealed`);
              const sc = match.sealedConfig || {};
              const packCounts =
                sc.packCounts && typeof sc.packCounts === "object"
                  ? sc.packCounts
                  : null;
              const replaceAvatars = !!sc.replaceAvatars;
              const freeAvatars = !!sc.freeAvatars;
              /** @type {string[]} */
              const sets = [];
              if (packCounts) {
                for (const [setName, cnt] of Object.entries(packCounts)) {
                  const c = Math.max(0, Number(cnt) || 0);
                  for (let i = 0; i < c; i++) sets.push(setName);
                }
                for (let i = sets.length - 1; i > 0; i--) {
                  const j = Math.floor(rng() * (i + 1));
                  [sets[i], sets[j]] = [sets[j], sets[i]];
                }
              } else {
                console.error(
                  `[Sealed] packCounts not provided for player ${pid} in match ${match.id}`
                );
                continue;
              }

              /** @type {Array<{ id: string, set: string, cards: Array<any> }>} */
              const packs = [];
              for (let i = 0; i < sets.length; i++) {
                const setName = sets[i];
                const picks = await generateBoosterDeterministic(
                  setName,
                  rng,
                  replaceAvatars,
                  freeAvatars
                );
                const cards = picks.map((p, idx) => ({
                  id: `${String(p.variantId)}_${i}_${idx}_${pid.slice(-4)}`,
                  name: p.cardName || "",
                  set: setName,
                  slug: String(p.slug || ""),
                  type: p.type ?? null,
                  cost: p.cost ?? null,
                  rarity: String(p.rarity || "Ordinary"),
                  cardId: typeof p.cardId === "number" ? p.cardId : undefined,
                  variantId:
                    typeof p.variantId === "number" ? p.variantId : undefined,
                  finish: typeof p.finish === "string" ? p.finish : undefined,
                  product:
                    typeof p.product === "string" ? p.product : undefined,
                }));
                packs.push({
                  id: `pack_${pid.slice(-4)}_${i}`,
                  set: setName,
                  cards,
                });
              }
              sealedPacks[pid] = packs;
            }
            match.sealedPacks = sealedPacks;
            io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
          } catch (err) {
            console.error(
              `[Sealed] Error generating sealed packs for match ${match.id}:`,
              err
            );
            io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
          }
        })();
        return;
      }

      io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
    });

    socket.on("joinTournament", async (payload) => {
      const { tournamentId } = payload || {};
      if (!tournamentId) return;

      const pid = playerIdBySocket.get(socket.id);
      if (!pid) return;

      socket.join(`tournament:${tournamentId}`);
      console.log(
        `[Tournament] Socket ${socket.id} (player ${pid}) joined tournament ${tournamentId}`
      );

      try {
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          include: { registrations: true },
        });
        if (tournament) {
          const payload = {
            id: tournament.id,
            name: tournament.name,
            format: tournament.format,
            status: tournament.status,
            maxPlayers: tournament.maxPlayers,
            currentPlayers: tournament.registrations.filter(
              (registration) => registration.seatStatus !== "vacant"
            ).length,
            creatorId: tournament.creatorId,
            settings: tournament.settings,
            createdAt: tournament.createdAt.toISOString(),
            startedAt: tournament.startedAt?.toISOString() || null,
            completedAt: tournament.completedAt?.toISOString() || null,
          };
          emitToSocket(socket, "tournament:updated", payload);
          setSnapshot(tournamentId, "tournament:updated", payload);
        }
      } catch (err) {
        console.error("[Tournament] Failed to send initial state:", err);
      }
    });

    socket.on("leaveTournament", (payload) => {
      const { tournamentId } = payload || {};
      if (!tournamentId) return;

      socket.leave(`tournament:${tournamentId}`);
      console.log(
        `[Tournament] Socket ${socket.id} left tournament ${tournamentId}`
      );
    });

    async function handlePreparationUpdate(payload) {
      const { tournamentId, preparationData } = payload || {};
      if (!tournamentId) return;
      const pid = playerIdBySocket.get(socket.id);
      if (!pid) return;
      try {
        const registration = await prisma.tournamentRegistration.findUnique({
          where: {
            tournamentId_playerId: {
              tournamentId,
              playerId: pid,
            },
          },
        });
        if (!registration) return;

        await prisma.tournamentRegistration.update({
          where: { id: registration.id },
          data: {
            preparationData: JSON.parse(JSON.stringify(preparationData)),
            preparationStatus: preparationData?.isComplete
              ? "completed"
              : "inProgress",
            deckSubmitted: Boolean(preparationData?.deckSubmitted),
          },
        });

        const [readyCount, totalCount] = await Promise.all([
          prisma.tournamentRegistration.count({
            where: {
              tournamentId,
              preparationStatus: "completed",
              deckSubmitted: true,
            },
          }),
          prisma.tournamentRegistration.count({ where: { tournamentId } }),
        ]);

        broadcastPreparationUpdate(
          tournamentId,
          pid,
          preparationData?.isComplete ? "completed" : "inProgress",
          readyCount,
          totalCount,
          Boolean(preparationData?.deckSubmitted)
        );
      } catch (err) {
        console.error("[Tournament] Preparation update failed:", err);
        emitToSocket(
          socket,
          "tournament:error",
          {
            code: "PREPARATION_UPDATE_FAILED",
            message: "Failed to update tournament preparation status",
            details: err?.message || String(err),
          },
          { includeLegacy: true }
        );
      }
    }

    socket.on("tournament:preparation:update", handlePreparationUpdate);
    socket.on("UPDATE_PREPARATION", handlePreparationUpdate);

    socket.on("disconnect", () => {
      const pid = playerIdBySocket.get(socket.id);
      if (!pid) return;
      try {
        if (currentTournamentIds.size > 0) {
          for (const tid of Array.from(currentTournamentIds)) {
            const list = upsertTournamentPresence(
              tid,
              pid,
              players.get(pid)?.displayName || null,
              false
            );
            emitTournamentPresence(tid, list);
          }
        }
      } catch {}
    });
  }

  return {
    registerSocketHandlers,
    getTournamentPresenceList,
    upsertTournamentPresence,
    broadcastTournamentUpdate,
    broadcastPhaseChanged,
    broadcastRoundStarted,
    broadcastPlayerJoined,
    broadcastPlayerLeft,
    broadcastPreparationUpdate,
    broadcastDraftReady,
    broadcastStatisticsUpdate,
  };
}

module.exports = { createTournamentFeature };
