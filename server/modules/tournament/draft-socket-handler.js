/**
 * Tournament Draft Socket Handler
 * Handles real-time socket events for tournament draft sessions
 */

/**
 * Register tournament draft socket event handlers
 * @param {import('socket.io').Socket} socket - Socket.IO socket instance
 * @param {Function} isAuthed - Function that returns whether the socket is authenticated
 * @param {Function} getPlayerBySocket - Function to get player from socket
 */
export function registerTournamentDraftHandlers(socket, isAuthed, getPlayerBySocket) {
  // Tournament draft pick - uses DraftSession + TournamentDraftEngine instead of match-based drafts
  socket.on("makeTournamentDraftPick", async (payload) => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    const { sessionId, cardId } = payload || {};
    if (!sessionId || !cardId) return;

    try {
      // Call Next.js API route to process the pick (TournamentDraftEngine only exists in Next.js)
      // In production, Next.js is on Vercel, so use NEXTAUTH_URL (https://realms.cards)
      // In development, Next.js runs locally, so use localhost (or host.docker.internal in Docker)
      let apiUrl = process.env.NEXT_API_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

      // Only replace localhost with host.docker.internal in development/Docker
      // In production, NEXTAUTH_URL should be the full https://realms.cards URL
      if (apiUrl.includes('localhost')) {
        apiUrl = apiUrl.replace('localhost', 'host.docker.internal');
      }

      const url = `${apiUrl}/api/draft-sessions/${sessionId}/pick`;

      console.log(`[Socket/TournamentDraft] Calling API: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pass through authentication - this is an internal server-to-server call
          'X-Internal-Call': 'true',
          'X-User-Id': player.id,
        },
        body: JSON.stringify({ cardId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Socket/TournamentDraft] API error ${response.status}:`, errorText);
        const error = errorText ? JSON.parse(errorText) : { error: 'Unknown error' };
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log(
        `[Socket/TournamentDraft] session=${sessionId} user=${player.id} cardId=${cardId} -> pick successful`
      );

      // Broadcast is handled by the API route via TournamentDraftEngine.broadcastStateUpdate()
    } catch (e) {
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
      const stack = e instanceof Error ? e.stack : '';
      console.error('[Socket/TournamentDraft] Pick error:', message);
      console.error('[Socket/TournamentDraft] Error stack:', stack);
      socket.emit('error', { message });
    }
  });
}
