// Headless CPU Bot Client for Sorcery MVP
// Connects to the Socket.IO game server as a normal client and performs basic actions

const { io } = require("socket.io-client");
const path = require("path");

// Lazy-loaded card database from data/cards_raw.json
let _CARDS_DB = null;
function _loadCardsDb() {
  if (_CARDS_DB) return _CARDS_DB;
  try {
    _CARDS_DB = require(path.join(__dirname, "..", "data", "cards_raw.json"));
  } catch (e) {
    try { console.warn("[Bot] Failed to load cards_raw.json:", e?.message || e); } catch {}
    _CARDS_DB = [];
  }
  return _CARDS_DB;
}

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

    // Draft preferences: stick to two elements when possible
    /** @type {string[]} */
    this.preferredElements = [];

    // Anti-spam guards / per-match state
    this._sealedSubmitted = new Set(); // matchId
    this._draftSubmitted = new Set(); // matchId
    this._packChosen = new Set(); // `${matchId}:${packIndex}`
    this._pickSent = new Set(); // `${matchId}:${packIndex}:${pickNumber}`
    this._draftReady = new Set(); // matchId
    this._d20Rolled = new Set(); // matchId
    this._seatChosen = new Set(); // matchId
    this._d20Last = { p1: null, p2: null }; // last known d20Rolls snapshot
    this._mulliganDoneSent = new Set(); // matchId

    // Scheduled guards to prevent multiple timeouts across repeated matchStarted/draftUpdate events
    this._sealedSubmitScheduled = new Set(); // matchId
    this._draftReadyScheduled = new Set(); // matchId
    this._d20Scheduled = new Set(); // matchId
    this._mulliganScheduled = new Set(); // matchId

    // Join guards
    this._joinedMatch = new Set(); // matchId

    // Live game tracking for basic AI
    this._game = null; // last merged server snapshot for current match
    this._lastCurrentPlayer = null;
    this._turnIndex = 0; // increments when currentPlayer changes
    this._actedTurn = new Set(); // `${matchId}:${turnIndex}`
    this._startedAsFirst = false; // true if we were the first player when Start applied
    this._constructedInitDone = new Set(); // matchId
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

      // Ensure we are in the match room so actions and patches are routed correctly
      try {
        if (match.id && !this._joinedMatch.has(match.id)) {
          this._joinedMatch.add(match.id);
          this.socket.emit("joinMatch", { matchId: match.id });
        }
      } catch {}

      // Friendly match-scope greeting
      try { socket.emit("chat", { content: "Good luck!", scope: "match" }); } catch {}

      if (match.matchType === "sealed") {
        this._handleSealedSetup(match);
      } else if (match.matchType === "draft") {
        // Signal that this player is ready in draft waiting room (once per match)
        if (!this._draftReady.has(match.id) && !this._draftReadyScheduled.has(match.id)) {
          this._draftReadyScheduled.add(match.id);
          setTimeout(() => {
            try {
              if (!this._draftReady.has(match.id)) {
                socket.emit("message", { type: "playerReady", ready: true });
                this._draftReady.add(match.id);
              }
            } catch {}
          }, 200);
        }
      } else {
        // Constructed: complete mulligan as soon as possible
        if (!this._mulliganDoneSent.has(match.id) && !this._mulliganScheduled.has(match.id)) {
          this._mulliganScheduled.add(match.id);
          setTimeout(() => {
            try {
              // Constructed starts in 'waiting', so this is safe to send and record
              if (!this._mulliganDoneSent.has(match.id)) {
                socket.emit("mulliganDone", {});
                this._mulliganDoneSent.add(match.id);
              }
            } catch {}
          }, 500 + Math.floor(Math.random() * 500));
        }
      }

      // Schedule D20 roll once per match (sufficient even if we miss a statePatch)
      if (!this._d20Scheduled.has(match.id)) {
        this._d20Scheduled.add(match.id);
        setTimeout(() => this._rollD20IfNeeded(), 400);
      }

      // Ensure mulligan completion is sent when server enters waiting (important for sealed)
      this._ensureMulliganAfterWaiting();

      // Ask for a full game snapshot so we can maintain zones/board/etc
      try { this.socket.emit('resyncRequest', {}); } catch {}

      // For constructed, ensure we have a simple deck ready when Start hits
      if (match.matchType !== 'sealed' && match.matchType !== 'draft') {
        setTimeout(() => this._ensureConstructedDeckAndOpening(), 200);
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

    // Game state patches (used for D20 setup & seat choice)
    socket.on("statePatch", (payload) => {
      try {
        const patch = payload && payload.patch ? payload.patch : payload;
        this._onStatePatch(patch);
        // Merge patch into our local snapshot for AI decisions
        this._mergeGamePatch(patch, payload && payload.t);
        this._maybeAct();
      } catch (err) {
        console.warn("[Bot] statePatch handler error:", err);
      }
    });

    // Resync with full snapshot
    socket.on('resyncResponse', (payload = {}) => {
      try {
        const snap = payload && payload.snapshot ? payload.snapshot : null;
        if (snap && snap.game) {
          this._game = JSON.parse(JSON.stringify(snap.game));
          // Initialize turn tracking from snapshot
          if (this._game && typeof this._game.currentPlayer === 'number') {
            this._lastCurrentPlayer = this._game.currentPlayer;
          }
          this._maybeAct();
        }
      } catch (e) {
        console.warn('[Bot] resyncResponse error:', e);
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

    // Guard against repeated submissions on subsequent matchStarted updates
    if (this._sealedSubmitted.has(match.id) || this._sealedSubmitScheduled.has(match.id)) return;

    // Flatten sealed pool
    /** @type {Array<{ id: string, name: string, set?: string, slug?: string, type?: string|null }>} */
    const pool = [];
    for (const pack of packs) {
      if (!pack || !Array.isArray(pack.cards)) continue;
      for (const c of pack.cards) {
        if (!c) continue;
        pool.push({ id: String(c.id), name: String(c.name || ""), set: String(c.set || ""), slug: String(c.slug || ""), type: c.type || null });
      }
    }

    const deck = this._buildLegalDeckFromPool(pool);

    // Mark as scheduled BEFORE the timeout to avoid multiple timers
    this._sealedSubmitScheduled.add(match.id);
    setTimeout(() => {
      try {
        this.socket.emit("submitDeck", { deck });
        this._sealedSubmitted.add(match.id);
        // Do NOT send mulliganDone yet; wait until server transitions to 'waiting'
      } catch {}
    }, 300);
  }

  _onStatePatch(patch) {
    try {
      if (patch && typeof patch === 'object' && patch.d20Rolls) {
        const r = patch.d20Rolls || {};
        const prev = this._d20Last || { p1: null, p2: null };
        this._d20Last = {
          p1: r.p1 !== undefined ? r.p1 : (prev.p1 ?? null),
          p2: r.p2 !== undefined ? r.p2 : (prev.p2 ?? null),
        };
        // If tie/reset occurred (both null), allow rolling again
        const cur = this.currentMatch;
        if (cur && (this._d20Last.p1 == null && this._d20Last.p2 == null)) {
          this._d20Rolled.delete(cur.id);
        }
      }

      // If we won the D20, choose to go first automatically (once)
      if (patch && typeof patch === 'object' && (patch.setupWinner !== undefined || patch.phase !== undefined)) {
        const cur = this.currentMatch;
        if (cur && !this._seatChosen.has(cur.id)) {
          const meKey = this.playerIndex === 1 ? 'p2' : 'p1';
          const winner = patch.setupWinner;
          const phase = patch.phase;
          if (winner === meKey && phase !== 'Start') {
            this._seatChosen.add(cur.id);
            // Small delay to let dice animations complete on clients
            setTimeout(() => {
              try {
                const firstPlayer = meKey === 'p1' ? 1 : 2;
                this.socket.emit('action', { action: { phase: 'Start', currentPlayer: firstPlayer } });
              } catch {}
            }, 300);
          }
        }
      }
      // Opportunistically roll if still missing
      this._rollD20IfNeeded();
      // For sealed, server will broadcast matchStarted with status 'waiting' when ready; but also call this here to be safe
      this._ensureMulliganAfterWaiting();

      // Detect if we started first when Start is applied
      if (patch && typeof patch === 'object' && patch.phase === 'Start') {
        const myNum = this.playerIndex === 1 ? 2 : 1;
        if (typeof patch.currentPlayer === 'number' && patch.currentPlayer === myNum) {
          this._startedAsFirst = true;
        }
        // Ensure we have a constructed deck and opening hand ready
        this._ensureConstructedDeckAndOpening();
      }
    } catch {}
  }

  _ensureConstructedDeckAndOpening() {
    try {
      const match = this.currentMatch;
      if (!match) return;
      if (match.matchType === 'sealed' || match.matchType === 'draft') return;
      const mid = match.id;
      if (this._constructedInitDone.has(mid)) return;
      const meKey = this.playerIndex === 1 ? 'p2' : 'p1';
      const zones = this._game && this._game.zones && this._game.zones[meKey];
      const needInit = !zones || !Array.isArray(zones.spellbook) || zones.spellbook.length === 0 || !Array.isArray(zones.atlas) || zones.atlas.length === 0;
      if (!needInit) {
        this._constructedInitDone.add(mid);
        return;
      }
      // Build a 24/12 constructed deck using real slugs from cards_raw.json and draw opening 3+3
      const deck = this._buildConstructedDeckFromData();
      const spells = Array.isArray(deck.book) ? [...deck.book] : [];
      const sites = Array.isArray(deck.atlas) ? [...deck.atlas] : [];
      const hand = [];
      for (let i = 0; i < 3 && spells.length; i++) hand.push(spells.shift());
      for (let i = 0; i < 3 && sites.length; i++) hand.push(sites.shift());
      const myZones = {
        spellbook: spells,
        atlas: sites,
        hand,
        graveyard: [],
        battlefield: [],
        banished: [],
      };
      const patch = { zones: { [meKey]: myZones } };
      try {
        this.socket.emit('action', { action: patch });
        this._constructedInitDone.add(mid);
        try { console.log('[Bot] Initialized constructed deck and opening hand'); } catch {}
      } catch {}
    } catch {}
  }

  _mergeGamePatch(patch, t) {
    try {
      if (!patch || typeof patch !== 'object') return;
      if (!this._game || typeof this._game !== 'object') this._game = {};
      const merge = (dst, src) => {
        if (!src || typeof src !== 'object') return dst;
        for (const k of Object.keys(src)) {
          const sv = src[k];
          const dv = dst[k];
          if (Array.isArray(sv)) {
            dst[k] = sv;
          } else if (sv && typeof sv === 'object') {
            dst[k] = merge(dv && typeof dv === 'object' ? { ...dv } : {}, sv);
          } else {
            dst[k] = sv;
          }
        }
        return dst;
      };
      this._game = merge({ ...this._game }, patch);
      // Track turn changes
      if (typeof this._game.currentPlayer === 'number') {
        if (this._lastCurrentPlayer === null) this._lastCurrentPlayer = this._game.currentPlayer;
        if (this._lastCurrentPlayer !== this._game.currentPlayer) {
          this._turnIndex++;
          this._lastCurrentPlayer = this._game.currentPlayer;
        }
      }
    } catch {}
  }

  _maybeAct() {
    try {
      const match = this.currentMatch;
      if (!match || !this._game) return;
      // Do not act during setup. Wait until server has transitioned to in_progress and Main phase
      if (match.status !== 'in_progress') return;
      if (this._game.phase !== 'Main') return;
      const myNum = this.playerIndex === 1 ? 2 : 1;
      const meKey = this.playerIndex === 1 ? 'p2' : 'p1';
      if (this._game.currentPlayer !== myNum) return;
      const turnKey = `${match.id}:${this._turnIndex}`;
      if (this._actedTurn.has(turnKey)) return;

      let zones = (this._game.zones && this._game.zones[meKey]) || null;
      const board = this._game.board || { size: { w: 5, h: 5 }, sites: {} };
      const avatars = this._game.avatars || { p1: { card: null, pos: null }, p2: { card: null, pos: null } };
      if (!zones) {
        // Minimal stub so we can still act (draw will no-op, plays may no-op)
        zones = {
          spellbook: [],
          atlas: [],
          hand: [],
          graveyard: [],
          battlefield: [],
          banished: [],
        };
      }

      // Build a single action patch aggregating all simple moves
      /** @type {any} */
      const patch = { zones: {} };
      const myZones = { ...zones };

      // Note: Do not promote Start->Main here. Server will flip to Main after both players finalize mulligans.

      // 1) Draw one card (skip if we started first on the very first turn)
      const isFirstTurnForMe = this._turnIndex === 0 && this._startedAsFirst === true;
      if (!isFirstTurnForMe) {
        const spellbook = Array.isArray(myZones.spellbook) ? [...myZones.spellbook] : [];
        if (spellbook.length > 0) {
          const top = spellbook.shift();
          const hand = Array.isArray(myZones.hand) ? [...myZones.hand, top] : [top];
          myZones.spellbook = spellbook;
          myZones.hand = hand;
        }
      }

      // Helper: find a first empty board cell
      const findEmptyCell = () => {
        const w = (board.size && board.size.w) || 5;
        const h = (board.size && board.size.h) || 5;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const key = `${x},${y}`;
            const tile = (board.sites && board.sites[key]) || null;
            if (!tile || !tile.card) return key;
          }
        }
        return '0,0';
      };

      // 2) Play a site from hand to the first empty tile
      let placedCell = null;
      const handNow = Array.isArray(myZones.hand) ? [...myZones.hand] : [];
      const siteIdx = handNow.findIndex((c) => c && typeof c.type === 'string' && c.type.toLowerCase().includes('site'));
      if (siteIdx !== -1) {
        const siteCard = handNow.splice(siteIdx, 1)[0];
        const cellKey = findEmptyCell();
        placedCell = cellKey;
        // Update zones
        myZones.hand = handNow;
        // Update board tile
        patch.board = patch.board || { sites: {} };
        patch.board.sites[cellKey] = { owner: myNum, tapped: false, card: siteCard };
      }

      // 3) Ensure avatar has a real card slug and tap it
      let av = avatars && avatars[meKey] ? { ...avatars[meKey] } : { card: null, pos: null };
      if (!av.card || !av.card.slug) {
        const avatarRef = this._chooseAvatarCardRef();
        if (avatarRef) {
          av = { ...av, card: avatarRef };
        }
      }
      patch.avatars = patch.avatars || {};
      patch.avatars[meKey] = { ...av, tapped: true };

      // 4) Play a non-site card to battlefield if possible
      const handAfterSite = Array.isArray(myZones.hand) ? [...myZones.hand] : [];
      const nonSiteIdx = handAfterSite.findIndex((c) => c && typeof c.type === 'string' && !c.type.toLowerCase().includes('site'));
      if (nonSiteIdx !== -1) {
        const card = handAfterSite.splice(nonSiteIdx, 1)[0];
        myZones.hand = handAfterSite;
        const at = placedCell || findEmptyCell();
        patch.permanents = patch.permanents || {};
        const existing = (this._game.permanents && this._game.permanents[at]) || [];
        patch.permanents[at] = [...existing, { owner: myNum, card, tapped: false }];
      }

      // Apply zones patch for me
      patch.zones[meKey] = myZones;

      // Debug: summarize intent
      try {
        const playedSite = siteIdx !== -1;
        const playedCard = nonSiteIdx !== -1;
        const drew = !isFirstTurnForMe && Array.isArray(zones.spellbook) && zones.spellbook.length > (myZones.spellbook?.length || 0);
        console.log(`[Bot] Act turn=${this._turnIndex} P${myNum}: draw=${!isFirstTurnForMe} site=${playedSite} card=${playedCard}`);
      } catch {}

      // Send action
      try {
        this.socket.emit('action', { action: patch });
      } catch {}

      // Mark acted this turn and schedule end-turn after a short delay
      this._actedTurn.add(turnKey);
      setTimeout(() => {
        try {
          const other = myNum === 1 ? 2 : 1;
          try { console.log(`[Bot] End turn -> P${other}`); } catch {}
          this.socket.emit('action', { action: { currentPlayer: other, phase: 'Main' } });
        } catch {}
      }, 500);

      // Fallback: if currentPlayer didn't flip after 1.2s, try once more
      setTimeout(() => {
        try {
          if (!this._game) return;
          if (this._game.currentPlayer === myNum) {
            const other = myNum === 1 ? 2 : 1;
            try { console.log(`[Bot] End turn retry -> P${other}`); } catch {}
            this.socket.emit('action', { action: { currentPlayer: other, phase: 'Main' } });
          }
        } catch {}
      }, 1200);
    } catch (e) {
      console.warn('[Bot] _maybeAct error:', e);
    }
  }

  _ensureMulliganAfterWaiting() {
    try {
      const m = this.currentMatch;
      if (!m || m.status !== 'waiting') return;
      if (this._mulliganDoneSent.has(m.id) || this._mulliganScheduled.has(m.id)) return;
      this._mulliganScheduled.add(m.id);
      setTimeout(() => {
        try {
          // Re-check current match and status to avoid stale timers
          const cur = this.currentMatch;
          if (!cur || cur.id !== m.id || cur.status !== 'waiting') return;
          if (!this._mulliganDoneSent.has(cur.id)) {
            this.socket.emit('mulliganDone', {});
            this._mulliganDoneSent.add(cur.id);
          }
        } catch {}
      }, 600 + Math.floor(Math.random() * 600));
    } catch {}
  }

  _rollD20IfNeeded() {
    try {
      const match = this.currentMatch;
      if (!match || !this.socket) return;
      const meKey = this.playerIndex === 1 ? 'p2' : 'p1';
      const r = this._d20Last || { p1: null, p2: null };
      if (r[meKey] == null && !this._d20Rolled.has(match.id)) {
        const roll = 1 + Math.floor(Math.random() * 20);
        this._d20Rolled.add(match.id);
        this.socket.emit('action', { action: { d20Rolls: { [meKey]: roll } } });
      }
    } catch {}
  }

  _onDraftUpdate(state) {
    if (!this.currentMatch || this.currentMatch.matchType !== "draft") return;
    const meIdx = this.playerIndex >= 0 ? this.playerIndex : 0;
    const matchId = this.currentMatch.id;
    const phase = state && state.phase;
    if (!state || typeof state !== "object") return;

    if (phase === "pack_selection") {
      try {
        // Only choose a pack once per packIndex
        const k = `${matchId}:${state.packIndex || 0}`;
        if (!this._packChosen.has(k)) {
          const packsForMe = Array.isArray(state.allGeneratedPacks?.[meIdx]) ? state.allGeneratedPacks[meIdx] : [];
          const firstPack = packsForMe.find((p) => Array.isArray(p) && p.length > 0);
          const setChoice = (firstPack && (firstPack[0]?.setName || firstPack[0]?.set)) || "Beta";
          this.socket.emit("chooseDraftPack", { matchId, setChoice, packIndex: state.packIndex || 0 });
          this._packChosen.add(k);
        }
      } catch {}
      return;
    }

    if (phase === "picking") {
      try {
        const myId = this.you?.id;
        const waiting = Array.isArray(state.waitingFor) ? state.waitingFor : [];
        if (!myId || !waiting.includes(myId)) return;
        const myPack = Array.isArray(state.currentPacks?.[meIdx]) ? state.currentPacks[meIdx] : [];
        if (!myPack.length) return;
        this._updatePreferredElements(state);
        const scored = myPack
          .map((card) => ({ card, score: this._scoreDraftCard(card) }))
          .sort((a, b) => b.score - a.score);
        const pick = scored[0]?.card;
        if (pick) {
          const pk = `${matchId}:${state.packIndex || 0}:${state.pickNumber || 1}`;
          if (!this._pickSent.has(pk)) {
            this.socket.emit("makeDraftPick", {
              matchId,
              cardId: pick.id,
              packIndex: state.packIndex || 0,
              pickNumber: state.pickNumber || 1,
            });
            this._pickSent.add(pk);
          }
        }
      } catch (e) {
        console.warn("[Bot] picking error:", e);
      }
      return;
    }

    if (phase === "complete") {
      try {
        const picks = Array.isArray(state.picks?.[meIdx]) ? state.picks[meIdx] : [];
        const pool = picks.map((c) => ({
          id: String(c.id || c.cardId || ""),
          name: String(c.name || ""),
          set: String(c.setName || c.set || ""),
          slug: String(c.slug || ""),
          type: c.type || null,
          element: Array.isArray(c.element) ? c.element : [],
        }));
        this._updatePreferredElementsFromPool(pool);
        if (!this._draftSubmitted.has(matchId)) {
          const deck = this._buildLegalDeckFromPool(pool);
          setTimeout(() => {
            try {
              this.socket.emit("submitDeck", { deck });
              this._draftSubmitted.add(matchId);
              setTimeout(() => this.socket.emit("mulliganDone", {}), 1000 + Math.floor(Math.random() * 500));
            } catch {}
          }, 400);
        }
      } catch (e) {
        console.warn("[Bot] Failed to submit draft deck:", e);
      }
      return;
    }
  }

  _updatePreferredElements(state) {
    try {
      const meIdx = this.playerIndex >= 0 ? this.playerIndex : 0;
      const myPicks = Array.isArray(state.picks?.[meIdx]) ? state.picks[meIdx] : [];
      const counts = new Map();
      for (const c of myPicks) {
        const els = Array.isArray(c?.element) ? c.element : [];
        for (const e of els) counts.set(e, (counts.get(e) || 0) + 1);
      }
      const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([e]) => String(e));
      if (top.length) this.preferredElements = top;
    } catch {}
  }

  _updatePreferredElementsFromPool(pool) {
    try {
      const counts = new Map();
      for (const c of pool) {
        const els = Array.isArray(c?.element) ? c.element : [];
        for (const e of els) counts.set(e, (counts.get(e) || 0) + 1);
      }
      const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([e]) => String(e));
      if (top.length) this.preferredElements = top;
    } catch {}
  }

  _scoreDraftCard(card) {
    const t = String(card?.type || "").toLowerCase();
    const isSite = t.includes("site");
    const isAvatar = t.includes("avatar");
    let score = 0;
    const els = Array.isArray(card?.element) ? card.element : [];
    for (const e of els) if (this.preferredElements.includes(String(e))) score += 10;
    const r = String(card?.rarity || "").toLowerCase();
    if (r.includes("unique")) score += 4;
    else if (r.includes("elite")) score += 3;
    else if (r.includes("exceptional")) score += 2;
    else score += 1;
    if (isSite) score -= 5;
    if (isAvatar) score -= 2;
    const cost = Number(card?.cost || 0) || 0;
    score += Math.max(0, 6 - cost);
    return score;
  }

  _buildLegalDeckFromPool(pool) {
    const isSite = (t) => String(t || "").toLowerCase().includes("site");
    const isAvatar = (t) => String(t || "").toLowerCase().includes("avatar");

    const sites = [];
    const avatars = [];
    const spells = [];
    for (const c of pool) {
      if (isSite(c.type)) sites.push(c);
      else if (isAvatar(c.type)) avatars.push(c);
      else spells.push(c);
    }

    // Choose avatar (1): prefer first avatar in pool, otherwise fallback "Spellslinger"
    const main = [];
    if (avatars.length > 0) {
      const a = avatars[0];
      main.push(this._toDeckCard(a));
    } else {
      main.push(this._fallbackSpellslinger());
    }

    // Atlas: at least 12 sites; use from pool first, then fill with standard sites
    const neededSites = Math.max(12, 12);
    const atlas = [];
    for (let i = 0; i < Math.min(neededSites, sites.length); i++) {
      atlas.push(this._toDeckCard(sites[i], /*forceSite*/ true));
    }
    if (atlas.length < neededSites) {
      const std = this._standardSites(this.preferredElements);
      let idx = 0;
      while (atlas.length < neededSites) {
        atlas.push(std[idx % std.length]);
        idx++;
      }
    }

    // Spellbook: at least 24 non-avatar, non-site; use from pool first
    const neededSpells = Math.max(24, 24);
    const book = [];
    for (let i = 0; i < Math.min(neededSpells, spells.length); i++) {
      book.push(this._toDeckCard(spells[i]));
    }
    // If short (unlikely in sealed/draft), repeat pool spells in order to reach minimum
    let si = 0;
    while (book.length < neededSpells && spells.length > 0) {
      book.push(this._toDeckCard(spells[si % spells.length]));
      si++;
      if (si > 200) break; // safeguard
    }

    // Compose final deck list. Many consumers accept a flat list; keep sideboard empty for now.
    // For compatibility with our existing submitDeck usage, we'll send a simple shape { main, sideboard } of card refs.
    return {
      main: [...main, ...book, ...atlas],
      sideboard: [],
    };
  }

  _toDeckCard(c, forceSite = false) {
    // Normalize to a minimal card ref shape the server and client UIs tolerate
    return {
      id: String(c.id || ""),
      name: String(c.name || ""),
      set: c.set ? String(c.set) : undefined,
      slug: c.slug ? String(c.slug) : undefined,
      type: forceSite ? "Site" : (c.type || null),
    };
  }

  _fallbackSpellslinger() {
    const slug = this._getSlugForName('Spellslinger');
    return { id: `avatar_spellslinger_${Math.random().toString(36).slice(2,8)}`, name: 'Spellslinger', type: 'Avatar', set: 'Beta', slug: slug || undefined };
  }

  _standardSites(preferred = []) {
    // Return standard site card refs with real slugs, biased by preferred elements
    const map = { Air: 'Spire', Water: 'Stream', Earth: 'Valley', Fire: 'Wasteland' };
    const all = ['Spire','Stream','Valley','Wasteland'];
    const chosen = [];
    for (const e of preferred) {
      const n = map[String(e)] || null;
      if (n) chosen.push(n);
    }
    if (chosen.length < 2) chosen.push('Spire','Stream');
    const sequence = chosen.length ? chosen : all;
    return sequence.map((n, i) => {
      const slug = this._getSlugForName(n);
      return { id: `std_site_${i}_${Math.random().toString(36).slice(2,6)}`, name: n, type: "Site", set: 'Beta', slug: slug || undefined };
    });
  }

  // Build a 24/12 constructed deck using real slugs
  _buildConstructedDeckFromData() {
    const db = _loadCardsDb();
    // Pick 24 non-site, non-avatar cards, biased by preferred elements
    const want = 24;
    const preferred = Array.isArray(this.preferredElements) ? this.preferredElements : [];
    const isSite = (t) => String(t || '').toLowerCase().includes('site');
    const isAvatar = (t) => String(t || '').toLowerCase().includes('avatar');
    const candidates = [];
    for (const c of db) {
      try {
        const t = c?.guardian?.type || c?.sets?.[0]?.metadata?.type || '';
        if (isSite(t) || isAvatar(t)) continue;
        candidates.push(c);
      } catch {}
    }
    // Bias by preferred elements first
    const scored = candidates.map((c) => {
      const el = String(c?.elements || '').toLowerCase();
      let score = 0;
      for (const e of preferred) if (el.includes(String(e).toLowerCase())) score += 10;
      // Mild cost bias if present
      const cost = Number(c?.guardian?.cost || c?.sets?.[0]?.metadata?.cost || 0) || 0;
      score += Math.max(0, 6 - cost);
      return { c, score };
    }).sort((a,b) => b.score - a.score);
    const pick = (count) => scored.slice(0, Math.min(count, scored.length)).map(({ c }, idx) => this._toRefFromDb(c, idx));
    const book = pick(want);

    // Build 12 standard sites using real slugs
    const atlas = [];
    const std = this._standardSites(preferred);
    let idx = 0;
    while (atlas.length < 12) { atlas.push(std[idx % std.length]); idx++; }

    return { book, atlas };
  }

  _toRefFromDb(card, serial = 0) {
    const name = String(card?.name || 'Card');
    const type = String(card?.guardian?.type || card?.sets?.[0]?.metadata?.type || '') || null;
    const { slug, setName } = this._chooseVariantForCard(card);
    return { id: `${name.replace(/\s+/g,'_').toLowerCase()}_${serial}_${Math.random().toString(36).slice(2,6)}`, name, type, set: setName || 'Beta', slug: slug || undefined };
  }

  _chooseVariantForCard(card, preferSets = ['Beta','Alpha']) {
    try {
      const sets = Array.isArray(card?.sets) ? card.sets : [];
      let chosen = null;
      for (const s of preferSets) {
        const found = sets.find((x) => String(x?.name) === s);
        if (found) { chosen = found; break; }
      }
      if (!chosen && sets.length) chosen = sets[0];
      const variants = Array.isArray(chosen?.variants) ? chosen.variants : [];
      const pickStandard = (pred) => variants.find((x) => String(x?.finish) === 'Standard' && pred(String(x?.product || '').toLowerCase()));
      // Preference order: Standard Booster > Standard Draft Kit > any Standard > any
      let v = pickStandard((p) => p.includes('booster'))
           || pickStandard((p) => p.includes('draft_kit') || p.includes('draft kit'))
           || variants.find((x) => String(x?.finish) === 'Standard')
           || variants[0];
      return { slug: v?.slug ? String(v.slug) : null, setName: chosen?.name ? String(chosen.name) : null };
    } catch { return { slug: null, setName: null }; }
  }

  _getSlugForName(name, preferSets = ['Beta','Alpha']) {
    const db = _loadCardsDb();
    const card = db.find((c) => String(c?.name || '').toLowerCase() === String(name || '').toLowerCase());
    if (!card) return null;
    const { slug } = this._chooseVariantForCard(card, preferSets);
    return slug || null;
  }

  _chooseAvatarCardRef() {
    const db = _loadCardsDb();
    // Prefer Spellslinger; otherwise pick first Avatar in db
    const sSlug = this._getSlugForName('Spellslinger');
    if (sSlug) return { id: `avatar_spellslinger_${Math.random().toString(36).slice(2,6)}`, name: 'Spellslinger', type: 'Avatar', set: 'Beta', slug: sSlug };
    const avatar = db.find((c) => String(c?.guardian?.type || c?.sets?.[0]?.metadata?.type || '').toLowerCase().includes('avatar'));
    if (avatar) {
      const name = String(avatar.name || 'Avatar');
      const { slug, setName } = this._chooseVariantForCard(avatar);
      return { id: `avatar_${name.replace(/\s+/g,'_').toLowerCase()}_${Math.random().toString(36).slice(2,6)}`, name, type: 'Avatar', set: setName || 'Beta', slug: slug || undefined };
    }
    return null;
  }
}

module.exports = { BotClient };
