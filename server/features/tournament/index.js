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

  /** @type {Map<string, Map<string, { playerId: string, playerName: string|null, isConnected: boolean, lastActivity: number }>>} */
  const tournamentPresence = new Map();

  function getTournamentPresenceList(tournamentId) {
    const m = tournamentPresence.get(tournamentId);
    if (!m) return [];
    return Array.from(m.values());
  }

  function upsertTournamentPresence(tournamentId, playerId, playerName, isConnected) {
    let m = tournamentPresence.get(tournamentId);
    if (!m) {
      m = new Map();
      tournamentPresence.set(tournamentId, m);
    }
    const prev =
      m.get(playerId) || {
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
  }

  function broadcastPhaseChanged(tournamentId, newPhase, additionalData = {}) {
    tournamentBroadcast.emitPhaseChanged(io, tournamentId, newPhase, additionalData);
  }

  function broadcastRoundStarted(tournamentId, roundNumber, roundMatches) {
    tournamentBroadcast.emitRoundStarted(io, tournamentId, roundNumber, roundMatches);
  }

  function broadcastPlayerJoined(tournamentId, playerId, playerName, currentPlayerCount) {
    tournamentBroadcast.emitPlayerJoined(io, tournamentId, playerId, playerName, currentPlayerCount);
  }

  function broadcastPlayerLeft(tournamentId, playerId, playerName, currentPlayerCount) {
    tournamentBroadcast.emitPlayerLeft(io, tournamentId, playerId, playerName, currentPlayerCount);
  }

  function broadcastPreparationUpdate(tournamentId, playerId, preparationStatus, readyPlayerCount, totalPlayerCount, deckSubmitted = false) {
    tournamentBroadcast.emitPreparationUpdate(
      io,
      tournamentId,
      playerId,
      preparationStatus,
      readyPlayerCount,
      totalPlayerCount,
      deckSubmitted
    );
  }

  function broadcastDraftReady(tournamentId, payload) {
    tournamentBroadcast.emitDraftReady(io, tournamentId, payload);
  }

  function broadcastStatisticsUpdate(tournamentId, statistics) {
    tournamentBroadcast.emitStatisticsUpdate(io, tournamentId, statistics);
  }

  function registerSocketHandlers({ socket, isAuthed, getPlayerBySocket }) {
    /** @type {Set<string>} */
    const currentTournamentIds = new Set();

    socket.on("tournament:join", async (payload) => {
      const tournamentId = payload?.tournamentId;
      if (!tournamentId) return;

      console.log(`[Tournament] Player ${socket.id} joining tournament room: tournament:${tournamentId}`);
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
          io.to(`tournament:${tournamentId}`).emit("tournament:presence", { tournamentId, players: list });
        }
      } catch {}
    });

    socket.on("tournament:leave", async (payload) => {
      const tournamentId = payload?.tournamentId;
      if (!tournamentId) return;

      console.log(`[Tournament] Player ${socket.id} leaving tournament room: tournament:${tournamentId}`);
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
          io.to(`tournament:${tournamentId}`).emit("tournament:presence", { tournamentId, players: list });
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
      const matchId = typeof payload?.matchId === "string" ? payload.matchId : null;
      const playerIds = Array.isArray(payload?.playerIds)
        ? payload.playerIds.filter(Boolean).map(String)
        : [];
      const requestedMatchType = payload?.matchType || "constructed";
      const lobbyName = payload?.lobbyName || null;
      const tournamentId = payload?.tournamentId ? String(payload.tournamentId) : null;
      const sealedConfig = payload?.sealedConfig || null;
      if (!matchId || playerIds.length < 1) return;

      const actualMatchType = requestedMatchType === "sealed" ? "sealed" : "constructed";
      const normalizedSealedConfig =
        actualMatchType === "sealed"
          ? (() => {
              const base = normalizeSealedConfig(sealedConfig || {});
              if (base && !base.constructionStartTime) base.constructionStartTime = Date.now();
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
          status: actualMatchType === "sealed" ? "deck_construction" : "waiting",
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
            await storeRedis.set(`match:leader:${match.id}`, INSTANCE_ID, "NX", "EX", 60);
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
        if (!match.tournamentId && tournamentId) match.tournamentId = tournamentId;
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
                sc.packCounts && typeof sc.packCounts === "object" ? sc.packCounts : null;
              const replaceAvatars = !!sc.replaceAvatars;
              /** @type {string[]} */
              let sets = [];
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
                  replaceAvatars
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
                  variantId: typeof p.variantId === "number" ? p.variantId : undefined,
                  finish: typeof p.finish === "string" ? p.finish : undefined,
                  product: typeof p.product === "string" ? p.product : undefined,
                }));
                packs.push({ id: `pack_${pid.slice(-4)}_${i}`, set: setName, cards });
              }
              sealedPacks[pid] = packs;
            }
            match.sealedPacks = sealedPacks;
            io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
          } catch (err) {
            console.error(`[Sealed] Error generating sealed packs for match ${match.id}:`, err);
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
          socket.emit("TOURNAMENT_UPDATED", {
            id: tournament.id,
            name: tournament.name,
            format: tournament.format,
            status: tournament.status,
            maxPlayers: tournament.maxPlayers,
            currentPlayers: tournament.registrations.length,
            creatorId: tournament.creatorId,
            settings: tournament.settings,
            createdAt: tournament.createdAt.toISOString(),
            startedAt: tournament.startedAt?.toISOString() || null,
            completedAt: tournament.completedAt?.toISOString() || null,
          });
        }
      } catch (err) {
        console.error("[Tournament] Failed to send initial state:", err);
      }
    });

    socket.on("leaveTournament", (payload) => {
      const { tournamentId } = payload || {};
      if (!tournamentId) return;

      socket.leave(`tournament:${tournamentId}`);
      console.log(`[Tournament] Socket ${socket.id} left tournament ${tournamentId}`);
    });

    socket.on("UPDATE_PREPARATION", async (payload) => {
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
            preparationStatus: preparationData?.isComplete ? "completed" : "inProgress",
            deckSubmitted: Boolean(preparationData?.deckSubmitted),
          },
        });

        const [readyCount, totalCount] = await Promise.all([
          prisma.tournamentRegistration.count({
            where: { tournamentId, preparationStatus: "completed", deckSubmitted: true },
          }),
          prisma.tournamentRegistration.count({ where: { tournamentId } }),
        ]);

        io.to(`tournament:${tournamentId}`).emit("UPDATE_PREPARATION", {
          tournamentId,
          playerId: pid,
          preparationStatus: preparationData?.isComplete ? "completed" : "inProgress",
          deckSubmitted: Boolean(preparationData?.deckSubmitted),
          readyPlayerCount: readyCount,
          totalPlayerCount: totalCount,
        });
      } catch (err) {
        console.error("[Tournament] Preparation update failed:", err);
      }
    });

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
            io.to(`tournament:${tid}`).emit("tournament:presence", { tournamentId: tid, players: list });
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
