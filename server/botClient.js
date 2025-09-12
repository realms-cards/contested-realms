// Headless CPU Bot Client for Sorcery MVP
// Connects to the Socket.IO game server as a normal client and performs basic actions

const { io } = require("socket.io-client");

class BotClient {
  /**
   * @param {{ serverUrl: string, displayName?: string, playerId?: string, lobbyId?: string }} opts
   */
  constructor(opts) {
    this.serverUrl = opts.serverUrl || "http://localhost:3010";
    this.displayName = (opts.displayName || "CPU Bot").slice(0, 40);
    this.playerId = opts.playerId || `cpu_${Math.random().toString(36).slice(2, 10)}`;
    this.lobbyId = opts.lobbyId || null;

    this.socket = null;
    this.you = null; // { id, displayName }
    this.currentMatch = null; // { id, matchType, players, sealedPacks?, draftState? }
    this.playerIndex = -1; // index into match.players

    // internal flags
    this._connected = false;
    this._joinedLobby = false;
  }

  async start() {
    if (this.socket) return;

    const socket = io(this.serverUrl, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
    });
    this.socket = socket;

    socket.on("connect", () => {
      this._connected = true;
      // Send hello on connect (and reconnects)
      socket.emit("hello", {
        displayName: `[CPU] ${this.displayName}`,
        playerId: this.playerId,
      });
    });

    socket.on("disconnect", () => {
      this._connected = false;
    });

    socket.on("welcome", (payload) => {
      this.you = payload && payload.you ? payload.you : null;
      // Join the requested lobby and ready up
      if (this.lobbyId) {
        socket.emit("joinLobby", { lobbyId: this.lobbyId });
      } else {
        socket.emit("joinLobby", {});
      }
    });

    socket.on("joinedLobby", (payload) => {
      this._joinedLobby = true;
      // Ready up immediately
      setTimeout(() => {
        socket.emit("ready", { ready: true });
        // Say hello so opponents see CPU in console
        socket.emit("chat", { content: `Hello! I'm ${this.displayName}.`, scope: "lobby" });
      }, 200);
    });

    socket.on("lobbyUpdated", (_payload) => {
      // no-op for now
    });

    socket.on("matchStarted", (payload) => {
      const match = payload && payload.match ? payload.match : null;
      if (!match) return;
      this.currentMatch = match;
      this.playerIndex = this._resolvePlayerIndex(match);

      // Friendly match-scope greeting
      try { socket.emit("chat", { content: "Good luck!", scope: "match" }); } catch {}

      if (match.matchType === "sealed") {
        this._handleSealedSetup(match);
      } else if (match.matchType === "draft") {
        // Signal that this player is ready in draft waiting room
        setTimeout(() => {
          socket.emit("message", { type: "playerReady", ready: true });
        }, 200);
      } else {
        // Constructed: complete mulligan as soon as possible
        setTimeout(() => socket.emit("mulliganDone", {}), 500 + Math.floor(Math.random() * 500));
      }
    });

    // Draft lifecycle
    socket.on("draftUpdate", (s) => {
      try {
        this._onDraftUpdate(s);
      } catch (err) {
        console.warn("[Bot] draftUpdate handler error:", err);
      }
    });

    // Basic error logging
    socket.on("error", (e) => {
      console.warn("[Bot] server error:", e);
    });
  }

  stop() {
    try {
      if (this.socket) this.socket.disconnect();
    } catch {}
    this.socket = null;
    this._connected = false;
  }

  _resolvePlayerIndex(match) {
    const me = this.you && this.you.id;
    if (!me || !Array.isArray(match.players)) return -1;
    for (let i = 0; i < match.players.length; i++) {
      const p = match.players[i];
      if (p && p.id === me) return i;
    }
    return -1;
  }

  _handleSealedSetup(match) {
    const me = this.you && this.you.id;
    if (!me) return;
    const packs = match.sealedPacks && match.sealedPacks[me];
    if (!Array.isArray(packs) || packs.length === 0) {
      // If packs not present yet, try again when a subsequent matchStarted fires (server emits after generation)
      return;
    }
    // Build a naive 30-card deck: flatten all packs and take first 30 card refs
    const cards = [];
    for (const pack of packs) {
      if (!pack || !Array.isArray(pack.cards)) continue;
      for (const c of pack.cards) {
        if (!c) continue;
        cards.push({ id: String(c.id), name: String(c.name || ""), set: String(c.set || ""), slug: String(c.slug || "") });
        if (cards.length >= 30) break;
      }
      if (cards.length >= 30) break;
    }
    const deck = { main: cards, sideboard: [] };
    setTimeout(() => {
      try {
        this.socket.emit("submitDeck", { deck });
        // After both players submit, the server will move to waiting -> in_progress when mulligans complete
        setTimeout(() => this.socket.emit("mulliganDone", {}), 800 + Math.floor(Math.random() * 400));
      } catch {}
    }, 300);
  }

  _onDraftUpdate(state) {
    if (!this.currentMatch || this.currentMatch.matchType !== "draft") return;
    const meIdx = this.playerIndex >= 0 ? this.playerIndex : 0;
    const matchId = this.currentMatch.id;
    const phase = state && state.phase;

    if (phase === "pack_selection") {
      // Choose a set based on pre-generated packs if available
      const all = state && state.allGeneratedPacks;
      let setChoice = null;
      if (Array.isArray(all) && all[meIdx] && Array.isArray(all[meIdx]) && all[meIdx][0] && Array.isArray(all[meIdx][0])) {
        // each entry is a pack (array of cards) with card[0].setName
        const packsForMe = all[meIdx];
        // Prefer the first pack's set name
        const firstPack = packsForMe.find((p) => Array.isArray(p) && p.length > 0);
        setChoice = firstPack && firstPack[0] && (firstPack[0].setName || firstPack[0].set);
      }
      if (!setChoice) setChoice = "Alpha";
      // Server uses setChoice; packIndex is informational
      setTimeout(() => this.socket.emit("chooseDraftPack", { matchId, setChoice, packIndex: state.packIndex || 0 }), 200);
      return;
    }

    if (phase === "picking") {
      // Pick the first available card from our current pack
      const packs = state && state.currentPacks;
      const myPack = Array.isArray(packs) && packs[meIdx] ? packs[meIdx] : null;
      if (!Array.isArray(myPack) || myPack.length === 0) return;

      // Simple heuristic: prefer higher rarity if available
      const rarityScore = (r) => {
        const t = String(r || "").toLowerCase();
        if (t.includes("legend")) return 4;
        if (t.includes("epic") || t.includes("myth")) return 3;
        if (t.includes("rare")) return 2;
        return 1;
      };
      let choice = myPack[0];
      let best = rarityScore(choice && choice.rarity);
      for (const c of myPack) {
        const s = rarityScore(c && c.rarity);
        if (s > best) {
          best = s;
          choice = c;
        }
      }
      const cardId = choice && (choice.id || choice.cardId);
      if (!cardId) return;
      const packIndex = state.packIndex || 0;
      const pickNumber = state.pickNumber || 1;
      setTimeout(() => this.socket.emit("makeDraftPick", { matchId, cardId: String(cardId), packIndex, pickNumber }), 250 + Math.floor(Math.random() * 300));
      return;
    }

    if (phase === "waiting") {
      // Ensure we signal readiness (redundant safe-guard)
      setTimeout(() => this.socket.emit("message", { type: "playerReady", ready: true }), 200);
      return;
    }

    if (phase === "complete") {
      // Draft finished: expect match to transition to deck_construction; nothing to do here
      return;
    }
  }
}

module.exports = { BotClient };
