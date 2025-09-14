// BotManager: handles active headless bots and lifecycle cleanup
// NOTE: This module is Node/CommonJS only and is used by server/index.js

class BotManager {
  constructor(io, players, lobbies, matches, getLobbyInfo, getMatchInfo, isCpuPlayerId) {
    this.io = io;
    this.players = players;
    this.lobbies = lobbies;
    this.matches = matches;
    this.getLobbyInfo = getLobbyInfo;
    this.getMatchInfo = getMatchInfo;
    this.isCpuPlayerId = typeof isCpuPlayerId === 'function' ? isCpuPlayerId : (id) => String(id || '').startsWith('cpu_');
    /** @type {Map<string, any>} */
    this.activeBots = new Map();
  }

  registerBot(botId, botInstance) {
    this.activeBots.set(botId, botInstance);
  }

  getBot(botId) {
    return this.activeBots.get(botId) || null;
  }

  stopAndRemoveBot(botId, reason = 'cleanup') {
    try {
      const p = this.players.get(botId);
      if (p) {
        // Remove from lobby if present
        if (p.lobbyId && this.lobbies.has(p.lobbyId)) {
          const lobby = this.lobbies.get(p.lobbyId);
          lobby.playerIds.delete(botId);
          lobby.ready.delete(botId);
          this.io.to(`lobby:${lobby.id}`).emit('lobbyUpdated', { lobby: this.getLobbyInfo(lobby) });
        }
        // Remove from match roster if present
        if (p.matchId && this.matches.has(p.matchId)) {
          const match = this.matches.get(p.matchId);
          match.playerIds = match.playerIds.filter((pid) => pid !== botId);
          this.io.to(`match:${match.id}`).emit('matchStarted', { match: this.getMatchInfo(match) });
        }
        // Disconnect socket if connected
        if (p.socketId) {
          const s = this.io.sockets.sockets.get(p.socketId);
          if (s) {
            try { s.disconnect(true); } catch {}
          }
        }
        this.players.delete(botId);
      }
    } catch {}

    // Stop headless client
    const bot = this.activeBots.get(botId);
    if (bot) {
      try { bot.stop(); } catch {}
      this.activeBots.delete(botId);
    }
    try { console.log(`[Bot] Removed CPU ${botId} (${reason})`); } catch {}
  }

  cleanupBotsForLobby(lobbyId) {
    for (const [pid, p] of this.players.entries()) {
      if (this.isCpuPlayerId(pid) && p.lobbyId === lobbyId && !p.matchId) {
        this.stopAndRemoveBot(pid, 'lobby_closed');
      }
    }
  }

  cleanupBotsAfterMatch(match) {
    if (!match) return;
    for (const pid of match.playerIds.slice()) {
      if (this.isCpuPlayerId(pid)) this.stopAndRemoveBot(pid, 'match_ended');
    }
  }
}

module.exports = { BotManager };
