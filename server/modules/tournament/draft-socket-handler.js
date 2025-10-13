/**
 * Tournament Draft Socket Handler
 * Handles real-time socket events for tournament draft sessions
 */

import * as tourneyEngine from './engine.js';

/**
 * Register tournament draft socket event handlers
 * @param {import('socket.io').Socket} socket - Socket.IO socket instance
 * @param {Function} isAuthed - Function that returns whether the socket is authenticated
 * @param {Function} getPlayerBySocket - Function to get player from socket
 */
export function registerTournamentDraftHandlers(socket, isAuthed, getPlayerBySocket) {
  // Tournament draft pick - uses DraftSession + TournamentDraftEngine instead of match-based drafts
  socket.on("makeTournamentDraftPick", async (payload) => {
    console.log('[Socket/TournamentDraft] makeTournamentDraftPick received:', JSON.stringify(payload));

    if (!isAuthed()) {
      console.log('[Socket/TournamentDraft] Not authenticated - rejecting pick');
      return;
    }

    const player = getPlayerBySocket(socket);
    if (!player) {
      console.log('[Socket/TournamentDraft] No player found for socket - rejecting pick');
      return;
    }

    console.log('[Socket/TournamentDraft] Player found:', player.id, player.name);

    const { sessionId, cardId } = payload || {};
    if (!sessionId || !cardId) {
      console.log('[Socket/TournamentDraft] Missing sessionId or cardId - rejecting pick');
      return;
    }

    console.log('[Socket/TournamentDraft] Processing pick:', { sessionId, playerId: player.id, cardId });

    try {
      // Execute pick locally via tournament engine (fast-path)
      const next = await tourneyEngine.makePick(sessionId, player.id, cardId);
      console.log('[Socket/TournamentDraft] Pick successful, new state phase:', next?.phase, 'pickNumber:', next?.pickNumber);
      // Engine already emits and publishes; also echo back to caller for immediate UX
      try { socket.emit('draftUpdate', next); } catch {}

    } catch (e) {
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
      const stack = e instanceof Error ? e.stack : '';
      console.error('[Socket/TournamentDraft] Pick error:', message);
      console.error('[Socket/TournamentDraft] Error stack:', stack);
      socket.emit('error', { message });
    }
  });

  // Tournament draft choose-pack (start of each round)
  socket.on("chooseTournamentDraftPack", async (payload = {}) => {
    console.log('[Socket/TournamentDraft] chooseTournamentDraftPack received:', JSON.stringify(payload));

    if (!isAuthed()) {
      console.log('[Socket/TournamentDraft] Not authenticated - rejecting pack choice');
      return;
    }

    const player = getPlayerBySocket(socket);
    if (!player) {
      console.log('[Socket/TournamentDraft] No player found for socket - rejecting pack choice');
      return;
    }

    console.log('[Socket/TournamentDraft] Player found:', player.id, player.name);

    const sessionId = payload?.sessionId;
    const packIndex = Number(payload?.packIndex || 0);
    if (!sessionId) {
      console.log('[Socket/TournamentDraft] Missing sessionId - rejecting pack choice');
      return;
    }

    console.log('[Socket/TournamentDraft] Processing pack choice:', { sessionId, playerId: player.id, packIndex });

    try {
      const next = await tourneyEngine.choosePack(sessionId, player.id, { packIndex });
      console.log('[Socket/TournamentDraft] Pack choice successful, new state phase:', next?.phase);
      try { socket.emit('draftUpdate', next); } catch {}
    } catch (e) {
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
      console.error('[Socket/TournamentDraft] choose-pack error:', message);
      socket.emit('error', { message });
    }
  });
}
