// Headless CPU Bot Client for Sorcery MVP (factored out from server)
// Connects to the Socket.IO game server as a normal client and performs basic actions
/* eslint-disable */
/* eslint-env node */

const path = require("path");
const fs = require("fs");
const { io } = require("socket.io-client");
const botEngine = require("./engine");

// Lazy-loaded card database from data/cards_raw.json
let _CARDS_DB = null;
function _loadCardsDb() {
  if (_CARDS_DB) return _CARDS_DB;
  try {
    _CARDS_DB = require(path.join(__dirname, "..", "data", "cards_raw.json"));
  } catch (e) {
    try {
      console.warn("[Bot] Failed to load cards_raw.json:", e?.message || e);
    } catch {}
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
    this.playerId =
      opts.playerId || `cpu_${Math.random().toString(36).slice(2, 10)}`;
    this.lobbyId = opts.lobbyId || null;

    this.socket = null;
    this.you = null; // { id, displayName }
    this.currentMatch = null; // { id, matchType, players, sealedPacks?, draftState? }
    this.playerIndex = -1; // index into match.players

    // AI engine configuration (overridable per bot)
    this.engineMode =
      (opts && typeof opts.engineMode === "string" && opts.engineMode) ||
      process.env.CPU_AI_ENGINE_MODE ||
      "evaluate"; // evaluate|train
    this.aiEnabled =
      opts && typeof opts.aiEnabled === "boolean"
        ? !!opts.aiEnabled
        : process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED === "1" ||
          process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED === "true";
    this.theta = (opts && opts.theta) || null;
    this._rng = null;
    this._trainLogPath = null;
    this._trainSeed = null;
    this.constructedDeckFile =
      (opts &&
        typeof opts.constructedDeckFile === "string" &&
        opts.constructedDeckFile) ||
      process.env.CPU_BOT_DECK_FILE ||
      null;
    this.constructedDeck =
      (opts &&
        typeof opts.constructedDeck === "object" &&
        opts.constructedDeck) ||
      null;

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
    this._mulliganKeepalive = new Map(); // matchId -> interval

    // Join guards
    this._joinedMatch = new Set(); // matchId

    // Live game tracking for basic AI
    this._game = null; // last merged server snapshot for current match
    this._lastCurrentPlayer = null;
    this._turnIndex = 0; // increments when currentPlayer changes
    this._actedTurn = new Set(); // `${matchId}:${turnIndex}`
    this._startedAsFirst = false; // true if we were the first player when Start applied
    this._constructedInitDone = new Set(); // matchId
    // Bot rules
    this._botRules = null;
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
      try {
        if (!this.theta) {
          let theta = null;
          const p =
            process.env.CPU_AI_PARAMS_PATH ||
            path.join(process.cwd(), "data", "bots", "params", "champion.json");
          if (fs.existsSync(p)) {
            try {
              theta = JSON.parse(fs.readFileSync(p, "utf8"));
            } catch {}
          }
          this.theta =
            theta ||
            (botEngine && botEngine.loadTheta ? botEngine.loadTheta() : null);
        }
      } catch {}
      // Load bot rules (JSON preferred, CSV fallback)
      try {
        this._ensureBotRulesLoaded();
      } catch {}
      // Join the requested lobby and ready up
      if (this.lobbyId) {
        socket.emit("joinLobby", { lobbyId: this.lobbyId });
      } else {
        socket.emit("joinLobby", {});
      }
    });

    socket.on("joinedLobby", () => {
      this._joinedLobby = true;
      setTimeout(() => {
        try {
          socket.emit("ready", { ready: true });
        } catch {}
        try {
          socket.emit("chat", {
            content: `Hello! I'm ${this.displayName}.`,
            scope: "lobby",
          });
        } catch {}
      }, 200);
    });

    socket.on("lobbyUpdated", () => {
      // no-op for now
    });

    socket.on("matchStarted", (payload) => {
      const match = payload && payload.match ? payload.match : null;
      if (!match) return;
      this.currentMatch = match;
      this.playerIndex = this._resolvePlayerIndex(match);
      try {
        const seedStr = `${match.seed || match.id}|${
          this.you?.id || this.playerId
        }`;
        this._trainSeed = seedStr;
        if (botEngine && botEngine.createRng)
          this._rng = botEngine.createRng(seedStr);
      } catch {}

      if (this.engineMode === "train") {
        try {
          const now = new Date();
          const y = String(now.getFullYear());
          const m = String(now.getMonth() + 1).padStart(2, "0");
          const d = String(now.getDate()).padStart(2, "0");
          const dir = path.join(
            process.cwd(),
            "logs",
            "training",
            `${y}${m}${d}`
          );
          fs.mkdirSync(dir, { recursive: true });
          this._trainLogPath = path.join(
            dir,
            `match_${match.id}_${this.playerId}.jsonl`
          );
          fs.appendFileSync(this._trainLogPath, "");
        } catch {}
      } else {
        this._trainLogPath = null;
      }

      // Ensure we are in the match room so actions and patches are routed correctly
      try {
        if (match.id && !this._joinedMatch.has(match.id)) {
          this._joinedMatch.add(match.id);
          this.socket.emit("joinMatch", { matchId: match.id });
        }
      } catch {}

      // Friendly match-scope greeting
      try {
        socket.emit("chat", { content: "Good luck!", scope: "match" });
      } catch {}

      if (match.matchType === "sealed") {
        this._handleSealedSetup(match);
      } else if (match.matchType === "draft") {
        // Signal that this player is ready in draft waiting room (once per match)
        if (
          !this._draftReady.has(match.id) &&
          !this._draftReadyScheduled.has(match.id)
        ) {
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
        if (
          !this._mulliganDoneSent.has(match.id) &&
          !this._mulliganScheduled.has(match.id)
        ) {
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
        // Keep emitting mulliganDone until we observe Main phase
        this._startMulliganKeepalive(match.id);
      }

      // Schedule D20 roll once per match (sufficient even if we miss a statePatch)
      if (!this._d20Scheduled.has(match.id)) {
        this._d20Scheduled.add(match.id);
        setTimeout(() => this._rollD20IfNeeded(), 400);
      }

      // Ensure mulligan completion is sent when server enters waiting (important for sealed)
      this._ensureMulliganAfterWaiting();

      // Ask for a full game snapshot so we can maintain zones/board/etc
      try {
        this.socket.emit("resyncRequest", {});
      } catch {}

      // For constructed, ensure we have a simple deck ready when Start hits
      if (match.matchType !== "sealed" && match.matchType !== "draft") {
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
        this._mergeGamePatch(patch);
        this._maybeAct();
      } catch (err) {
        console.warn("[Bot] statePatch handler error:", err);
      }
    });

    // Resync with full snapshot
    socket.on("resyncResponse", (payload = {}) => {
      try {
        const snap = payload && payload.snapshot ? payload.snapshot : null;
        if (snap && snap.game) {
          this._game = JSON.parse(JSON.stringify(snap.game));
          // Initialize turn tracking from snapshot
          if (this._game && typeof this._game.currentPlayer === "number") {
            this._lastCurrentPlayer = this._game.currentPlayer;
          }
          this._maybeAct();
        }
      } catch (e) {
        console.warn("[Bot] resyncResponse error:", e);
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

  joinMatchById(matchId) {
    try {
      if (!this.socket || !matchId) return;
      if (!this._joinedMatch.has(matchId)) this._joinedMatch.add(matchId);
      this.socket.emit("joinMatch", { matchId });
    } catch {}
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
    if (
      this._sealedSubmitted.has(match.id) ||
      this._sealedSubmitScheduled.has(match.id)
    )
      return;

    // Flatten sealed pool
    /** @type {Array<{ id: string, name: string, set?: string, slug?: string, type?: string|null }>} */
    const pool = [];
    for (const pack of packs) {
      if (!pack || !Array.isArray(pack.cards)) continue;
      for (const c of pack.cards) {
        if (!c) continue;
        pool.push({
          id: String(c.id),
          name: String(c.name || ""),
          set: String(c.set || ""),
          slug: String(c.slug || ""),
          type: c.type || null,
        });
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
      if (patch && typeof patch === "object" && patch.d20Rolls) {
        const r = patch.d20Rolls || {};
        const prev = this._d20Last || { p1: null, p2: null };
        this._d20Last = {
          p1: r.p1 !== undefined ? r.p1 : prev.p1 ?? null,
          p2: r.p2 !== undefined ? r.p2 : prev.p2 ?? null,
        };
        // If tie/reset occurred (both null), allow rolling again
        const cur = this.currentMatch;
        if (cur && this._d20Last.p1 == null && this._d20Last.p2 == null) {
          this._d20Rolled.delete(cur.id);
        }
      }

      // If we won the D20, choose to go first automatically (once)
      if (
        patch &&
        typeof patch === "object" &&
        (patch.setupWinner !== undefined || patch.phase !== undefined)
      ) {
        const cur = this.currentMatch;
        if (cur && !this._seatChosen.has(cur.id)) {
          const meKey = this.playerIndex === 1 ? "p2" : "p1";
          const winner = patch.setupWinner;
          const phase = patch.phase;
          if (winner === meKey && phase !== "Start") {
            this._seatChosen.add(cur.id);
            // Small delay to let dice animations complete on clients
            setTimeout(() => {
              try {
                const firstPlayer = meKey === "p1" ? 1 : 2;
                this.socket.emit("action", {
                  action: { phase: "Start", currentPlayer: firstPlayer },
                });
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
      if (patch && typeof patch === "object" && patch.phase === "Start") {
        const myNum = this.playerIndex === 1 ? 2 : 1;
        if (
          typeof patch.currentPlayer === "number" &&
          patch.currentPlayer === myNum
        ) {
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
      if (match.matchType === "sealed" || match.matchType === "draft") return;
      const mid = match.id;
      if (this._constructedInitDone.has(mid)) return;
      const meKey = this.playerIndex === 1 ? "p2" : "p1";
      const zones = this._game && this._game.zones && this._game.zones[meKey];
      const needInit =
        !zones ||
        !Array.isArray(zones.spellbook) ||
        zones.spellbook.length === 0 ||
        !Array.isArray(zones.atlas) ||
        zones.atlas.length === 0;
      if (!needInit) {
        this._constructedInitDone.add(mid);
        return;
      }
      let deck = null;
      if (this.constructedDeckFile) {
        deck = this._loadConstructedDeckFromFile(this.constructedDeckFile);
      } else if (this.constructedDeck) {
        deck = this._buildDeckFromConfig(this.constructedDeck);
      }
      if (!deck) {
        try {
          console.warn(
            "[Bot] No constructed deck provided; bots are restricted to precon decks. Skipping initialization."
          );
        } catch {}
        return;
      }
      const spells = Array.isArray(deck.book) ? [...deck.book] : [];
      const sites = Array.isArray(deck.atlas) ? [...deck.atlas] : [];
      const opening = this._chooseOpeningHand(spells, sites);
      const myZones = {
        spellbook: opening.restSpells,
        atlas: opening.restSites,
        hand: [...opening.handSpells, ...opening.handSites],
        graveyard: [],
        battlefield: [],
        collection: [],
        banished: [],
      };
      const patch = { zones: { [meKey]: myZones } };
      try {
        const hydrated = this._hydratePatchCardRefs(patch);
        // DEBUG: Log initial deck setup
        try {
          console.log(
            "[Bot] Initial deck setup - hand:",
            myZones.hand.length,
            "spellbook:",
            myZones.spellbook.length,
            "atlas:",
            myZones.atlas.length
          );
        } catch {}
        this.socket.emit("action", { action: hydrated });
        this._constructedInitDone.add(mid);
        try {
          console.log("[Bot] Initialized constructed deck and opening hand");
        } catch {}
      } catch {}
    } catch {}
  }

  _hydratePatchCardRefs(patch) {
    if (!patch || typeof patch !== "object") return patch;
    if (patch.zones) {
      for (const key in patch.zones) {
        const zone = patch.zones[key];
        if (zone && typeof zone === "object") {
          if (zone.hand) {
            zone.hand = zone.hand.map((c) => this._hydrateCardRef(c));
          }
          if (zone.spellbook) {
            zone.spellbook = zone.spellbook.map((c) => this._hydrateCardRef(c));
          }
          if (zone.atlas) {
            zone.atlas = zone.atlas.map((c) => this._hydrateCardRef(c));
          }
          if (zone.battlefield) {
            zone.battlefield = zone.battlefield.map((c) =>
              this._hydrateCardRef(c)
            );
          }
          if (zone.graveyard) {
            zone.graveyard = zone.graveyard.map((c) => this._hydrateCardRef(c));
          }
          if (zone.banished) {
            zone.banished = zone.banished.map((c) => this._hydrateCardRef(c));
          }
        }
      }
    }
    if (patch.board) {
      for (const key in patch.board.sites) {
        const site = patch.board.sites[key];
        if (site && site.card) {
          site.card = this._hydrateCardRef(site.card);
        }
      }
    }
    if (patch.avatars) {
      for (const key in patch.avatars) {
        const avatar = patch.avatars[key];
        if (avatar && avatar.card) {
          avatar.card = this._hydrateCardRef(avatar.card);
        }
      }
    }
    return patch;
  }

  _hydrateCardRef(card) {
    if (!card || typeof card !== "object") return card;
    if (!card.slug) {
      // Prefer name-based lookup; our generated IDs are not stable
      const name = card.name ? String(card.name) : null;
      if (name) {
        const slug = this._getSlugForName(name);
        if (slug) card.slug = slug;
      }
    }
    // Attach thresholds so the engine can gate non-site plays locally
    try {
      if (!card.thresholds) {
        const th = this._getThresholdsForCard(card);
        if (th) card.thresholds = th;
      }
    } catch {}
    // Attach type if missing so engine can identify permanents
    try {
      if (!card.type || typeof card.type !== "string" || !card.type.length) {
        const t = this._getTypeForCard(card);
        if (t) card.type = t;
      }
    } catch {}
    return card;
  }

  _getCardRef(id) {
    // Deprecated: we no longer rely on IDs for lookup; use name -> slug
    return null;
  }

  _getTypeForCard(card) {
    try {
      const db = _loadCardsDb();
      const slug = card && card.slug ? String(card.slug) : null;
      if (slug) {
        for (const c of db) {
          const sets = Array.isArray(c?.sets) ? c.sets : [];
          for (const s of sets) {
            const vs = Array.isArray(s?.variants) ? s.variants : [];
            if (vs.find((v) => String(v.slug) === slug)) {
              return (
                String(
                  c?.guardian?.type || c?.sets?.[0]?.metadata?.type || ""
                ) || null
              );
            }
          }
        }
      }
      const nm = card && card.name ? String(card.name) : null;
      if (nm) {
        const found = db.find(
          (c) => String(c?.name || "").toLowerCase() === nm.toLowerCase()
        );
        if (found)
          return (
            String(
              found?.guardian?.type || found?.sets?.[0]?.metadata?.type || ""
            ) || null
          );
      }
    } catch {}
    return null;
  }

  _ensureBotRulesLoaded() {
    try {
      if (this._botRules) return;
      const jsonP = path.join(process.cwd(), "data", "bots", "botrules.json");
      const csvP = path.join(process.cwd(), "reference", "BotRules.csv");
      let rules = null;
      if (fs.existsSync(jsonP)) {
        try {
          const obj = JSON.parse(fs.readFileSync(jsonP, "utf8"));
          if (obj && typeof obj === "object" && Array.isArray(obj.rules))
            rules = obj;
        } catch {}
      }
      if (!rules && fs.existsSync(csvP)) {
        try {
          const txt = fs.readFileSync(csvP, "utf8");
          rules = this._parseBotRulesCsv(txt);
        } catch {}
      }
      this._botRules = rules || { version: 1, rules: [] };
    } catch {}
  }

  _parseBotRulesCsv(text) {
    try {
      if (!text || typeof text !== "string") return { version: 1, rules: [] };
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) return { version: 1, rules: [] };
      const header = lines[0].split(",").map((h) =>
        String(h || "")
          .trim()
          .toLowerCase()
      );
      const idx = (name) => header.indexOf(String(name).toLowerCase());
      const rules = [];
      for (let i = 1; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw || !raw.trim()) continue;
        const cols = raw.split(",");
        const get = (name) => {
          const j = idx(name);
          return j >= 0 ? String(cols[j] || "").trim() : "";
        };
        const r = {
          category: get("category") || undefined,
          phase: get("phase") || undefined,
          action: get("action") || undefined,
          condition: get("condition") || undefined,
          constraint: get("constraint") || undefined,
        };
        const pr = Number(get("priority"));
        if (Number.isFinite(pr)) r.priority = pr;
        const eff = get("effect");
        if (eff) r.effect = eff;
        const src = get("source");
        if (src) r.source = src;
        if (r.action) rules.push(r);
      }
      return { version: 1, rules };
    } catch {
      return { version: 1, rules: [] };
    }
  }

  _getCostForCardRef(card) {
    try {
      if (card && typeof card.cost === "number") return Number(card.cost) || 0;
      const db = _loadCardsDb();
      const slug = card && card.slug ? String(card.slug) : null;
      if (slug) {
        for (const c of db) {
          const sets = Array.isArray(c?.sets) ? c.sets : [];
          for (const s of sets) {
            const vs = Array.isArray(s?.variants) ? s.variants : [];
            if (vs.find((v) => String(v.slug) === slug)) {
              const meta =
                c?.guardian ||
                (Array.isArray(c?.sets) && c.sets.length > 0
                  ? c.sets[0]?.metadata
                  : null);
              const cost =
                meta && typeof meta.cost === "number" ? Number(meta.cost) : 0;
              return Number.isFinite(cost) ? cost : 0;
            }
          }
        }
      }
      const nm = card && card.name ? String(card.name) : null;
      if (nm) {
        const found = db.find(
          (c) => String(c?.name || "").toLowerCase() === nm.toLowerCase()
        );
        if (found) {
          const meta =
            found?.guardian ||
            (Array.isArray(found?.sets) && found.sets.length > 0
              ? found.sets[0]?.metadata
              : null);
          const cost =
            meta && typeof meta.cost === "number" ? Number(meta.cost) : 0;
          return Number.isFinite(cost) ? cost : 0;
        }
      }
    } catch {}
    return 0;
  }

  _chooseOpeningHand(spells, sites) {
    try {
      const rng =
        this._rng ||
        ((seed) => {
          let x = 1234567;
          return () =>
            (((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5)) >>> 0) /
            4294967296;
        })(`${this._trainSeed || "seed"}/opening`);
      const shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const isPerm = (c) => {
        const t = String(c?.type || "").toLowerCase();
        return (
          !!t &&
          !t.includes("site") &&
          !t.includes("avatar") &&
          !t.includes("spell")
        );
      };
      const perms = spells.filter(isPerm);
      const nonPerms = spells.filter((c) => !isPerm(c));
      const score = (c) => this._getCostForCardRef(c) + (isPerm(c) ? -2 : 0);
      const permSorted = perms
        .map((c) => ({ c, s: score(c) }))
        .sort((a, b) => a.s - b.s)
        .map((x) => x.c);
      const otherSorted = nonPerms
        .map((c) => ({ c, s: score(c) }))
        .sort((a, b) => a.s - b.s)
        .map((x) => x.c);
      const handSpells = [];
      for (const c of permSorted) {
        if (handSpells.length >= 3) break;
        handSpells.push(c);
      }
      for (const c of otherSorted) {
        if (handSpells.length >= 3) break;
        handSpells.push(c);
      }
      const pickedIdx = new Set(handSpells.map((c) => spells.indexOf(c)));
      const restSpells = spells.filter((_, i) => !pickedIdx.has(i));

      // Sites: favor early color fixing by taking first 3 (atlas already balanced by _standardSites)
      const sitesShuffled = shuffle(sites);
      // Light bias toward 'Valley' and 'Stream' if present
      sitesShuffled.sort((a, b) => {
        const bias = (n) => {
          const nm = String(n?.name || "").toLowerCase();
          if (nm.includes("valley")) return -2;
          if (nm.includes("stream")) return -1;
          return 0;
        };
        return bias(a) - bias(b) || rng() - 0.5;
      });
      const handSites = sitesShuffled.slice(
        0,
        Math.min(3, sitesShuffled.length)
      );
      const restSites = sites.filter((c, i) => !handSites.includes(c));

      return { handSpells, handSites, restSpells, restSites };
    } catch {
      // Fallback: first 3 + first 3
      const hs = spells.slice(0, 3);
      const hsi = sites.slice(0, 3);
      return {
        handSpells: hs,
        handSites: hsi,
        restSpells: spells.slice(hs.length),
        restSites: sites.slice(hsi.length),
      };
    }
  }

  _mergeGamePatch(patch) {
    try {
      if (!patch || typeof patch !== "object") return;
      if (!this._game || typeof this._game !== "object") this._game = {};
      const merge = (dst, src) => {
        if (!src || typeof src !== "object") return dst;
        for (const k of Object.keys(src)) {
          const sv = src[k];
          const dv = dst[k];
          if (Array.isArray(sv)) {
            dst[k] = sv;
          } else if (sv && typeof sv === "object") {
            dst[k] = merge(dv && typeof dv === "object" ? { ...dv } : {}, sv);
          } else {
            dst[k] = sv;
          }
        }
        return dst;
      };
      this._game = merge({ ...this._game }, patch);
      // Track turn changes
      if (typeof this._game.currentPlayer === "number") {
        if (this._lastCurrentPlayer === null)
          this._lastCurrentPlayer = this._game.currentPlayer;
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
      if (match.status !== "in_progress") return;
      if (this._game.phase !== "Main") return;
      const myNum = this.playerIndex === 1 ? 2 : 1;
      const meKey = this.playerIndex === 1 ? "p2" : "p1";
      if (this._game.currentPlayer !== myNum) return;
      const turnKey = `${match.id}:${this._turnIndex}`;
      if (this._actedTurn.has(turnKey)) return;

      // DEBUG: Log game state before acting
      try {
        const zones = (this._game.zones && this._game.zones[meKey]) || null;
        const handSize = zones && zones.hand ? zones.hand.length : 0;
        const sites = (this._game.board && this._game.board.sites) || {};
        const ownedSites = Object.values(sites).filter(
          (s) => s && s.card && Number(s.owner) === myNum
        ).length;
        console.log(
          `[Bot] Turn ${this._turnIndex}: hand=${handSize}, ownedSites=${ownedSites}, turnKey=${turnKey}`
        );
      } catch {}

      let zones = (this._game.zones && this._game.zones[meKey]) || null;
      const board = this._game.board || { size: { w: 5, h: 5 }, sites: {} };
      const avatars = this._game.avatars || {
        p1: { card: null, pos: null },
        p2: { card: null, pos: null },
      };
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
      const isFirstTurnForMe =
        this._turnIndex === 0 && this._startedAsFirst === true;
      // AI Engine path (evaluate/train): generate a move using the parameterized engine
      if (
        this.aiEnabled &&
        botEngine &&
        typeof botEngine.search === "function"
      ) {
        try {
          const baseTheta =
            this.theta && this.theta.weights
              ? this.theta
              : botEngine.loadTheta
              ? botEngine.loadTheta()
              : null;
          const mergedTheta = (() => {
            const t = baseTheta ? JSON.parse(JSON.stringify(baseTheta)) : {};
            if (this.theta && this.theta.search)
              t.search = { ...(t.search || {}), ...this.theta.search };
            if (this.theta && this.theta.exploration)
              t.exploration = {
                ...(t.exploration || {}),
                ...this.theta.exploration,
              };
            if (this.theta && this.theta.meta)
              t.meta = { ...(t.meta || {}), ...this.theta.meta };
            return t;
          })();
          const patch = botEngine.search(
            this._game,
            meKey,
            mergedTheta,
            this._rng ||
              (botEngine.createRng
                ? botEngine.createRng(
                    `${this.currentMatch?.id}|${this.you?.id || this.playerId}`
                  )
                : null),
            {
              skipDrawThisTurn: isFirstTurnForMe,
              mode: this.engineMode === "train" ? "train" : "evaluate",
              exploration: (mergedTheta && mergedTheta.exploration) || {
                epsilon_root: 0,
              },
              seed: this._trainSeed,
              rules: this._botRules || undefined,
              logger:
                this.engineMode === "train" && this._trainLogPath
                  ? (entry) => {
                      try {
                        const payload = {
                          matchId: this.currentMatch
                            ? this.currentMatch.id
                            : null,
                          turnIndex: this._turnIndex,
                          ...entry,
                        };
                        fs.appendFile(
                          this._trainLogPath,
                          JSON.stringify(payload) + "\n",
                          () => {}
                        );
                      } catch {}
                    }
                  : undefined,
            }
          );
          if (patch && typeof patch === "object") {
            const toSend = this._hydratePatchCardRefs(patch);
            // DEBUG: Log action being sent to understand cost errors
            try {
              const summary = {
                hasZones: !!toSend.zones,
                hasPermanents: !!toSend.permanents,
                hasBoard: !!toSend.board,
                permanentCount: toSend.permanents
                  ? Object.keys(toSend.permanents).length
                  : 0,
                boardSiteCount:
                  toSend.board && toSend.board.sites
                    ? Object.keys(toSend.board.sites).length
                    : 0,
              };
              // Log full patch for debugging
              console.log(
                "[Bot] Sending action (full):",
                JSON.stringify(toSend, null, 2).substring(0, 500)
              );
            } catch {}
            this.socket.emit("action", { action: toSend });
            // Mark acted this turn and schedule end-turn after a short delay
            this._actedTurn.add(turnKey);
            setTimeout(() => {
              try {
                const other = myNum === 1 ? 2 : 1;
                this.socket.emit("action", {
                  action: { currentPlayer: other, phase: "Main" },
                });
              } catch {}
            }, 500);
            // Fallback: if currentPlayer didn't flip after 1.2s, try once more
            setTimeout(() => {
              try {
                if (!this._game) return;
                if (this._game.currentPlayer === myNum) {
                  const other = myNum === 1 ? 2 : 1;
                  this.socket.emit("action", {
                    action: { currentPlayer: other, phase: "Main" },
                  });
                }
              } catch {}
            }, 1200);
            return; // avoid running the legacy heuristic path
          }
        } catch (e) {
          console.log("[Bot] AI engine failed:", e.message || e);
        }
      }
      if (!isFirstTurnForMe) {
        const spellbook = Array.isArray(myZones.spellbook)
          ? [...myZones.spellbook]
          : [];
        if (spellbook.length > 0) {
          const top = spellbook.shift();
          const hand = Array.isArray(myZones.hand)
            ? [...myZones.hand, top]
            : [top];
          myZones.spellbook = spellbook;
          myZones.hand = hand;
        }
      }

      // Helpers for board cell picking respecting Sorcery site rules
      const w = (board.size && board.size.w) || 5;
      const h = (board.size && board.size.h) || 5;
      const inBounds = (x, y) => x >= 0 && x < w && y >= 0 && y < h;
      const isEmpty = (x, y) => {
        const key = `${x},${y}`;
        const tile = (board.sites && board.sites[key]) || null;
        return !(tile && tile.card);
      };
      const findAnyEmptyCell = () => {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (isEmpty(x, y)) return `${x},${y}`;
          }
        }
        return "0,0";
      };
      const ownedSiteKeys = Object.keys(board.sites || {}).filter((k) => {
        const t = board.sites[k];
        return !!(t && t.card && Number(t.owner) === myNum);
      });
      const getAvatarPos = () => {
        const av = (avatars && avatars[meKey]) || {};
        const pos = Array.isArray(av.pos) ? av.pos : null;
        if (pos) return pos;
        // Fallback to canonical start positions: p1 top middle, p2 bottom middle
        const cx = Math.floor(Math.max(1, Number(w) || 5) / 2);
        const yy = myNum === 1 ? (Number(h) || 5) - 1 : 0;
        return [cx, yy];
      };
      const findAdjacentEmptyToOwned = () => {
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        for (const key of ownedSiteKeys) {
          const [xs, ys] = key.split(",");
          const x0 = Number(xs),
            y0 = Number(ys);
          for (const [dx, dy] of dirs) {
            const x = x0 + dx,
              y = y0 + dy;
            if (inBounds(x, y) && isEmpty(x, y)) return `${x},${y}`;
          }
        }
        return null;
      };

      // 2) Play a site from hand following first-site-at-avatar and adjacency rules
      let placedCell = null;
      const handNow = Array.isArray(myZones.hand) ? [...myZones.hand] : [];
      const siteIdx = handNow.findIndex(
        (c) =>
          c &&
          typeof c.type === "string" &&
          c.type.toLowerCase().includes("site")
      );
      if (siteIdx !== -1) {
        const siteCard = handNow.splice(siteIdx, 1)[0];
        let cellKey = null;
        if (ownedSiteKeys.length === 0) {
          const [ax, ay] = getAvatarPos();
          cellKey = isEmpty(ax, ay) ? `${ax},${ay}` : findAnyEmptyCell();
        } else {
          cellKey = findAdjacentEmptyToOwned() || findAnyEmptyCell();
        }
        placedCell = cellKey;
        // Update zones
        myZones.hand = handNow;
        // Update board tile
        patch.board = patch.board || { sites: {} };
        patch.board.sites[cellKey] = {
          owner: myNum,
          tapped: false,
          card: siteCard,
        };
      }

      // 3) Ensure avatar has a real card slug and tap it
      let av =
        avatars && avatars[meKey]
          ? { ...avatars[meKey] }
          : { card: null, pos: null };
      if (!av.card || !av.card.slug) {
        const avatarRef = this._chooseAvatarCardRef();
        if (avatarRef) {
          av = { ...av, card: avatarRef };
        }
      }
      patch.avatars = patch.avatars || {};
      patch.avatars[meKey] = { ...av, tapped: true };

      // 4) Play a non-site card to battlefield if possible
      const handAfterSite = Array.isArray(myZones.hand)
        ? [...myZones.hand]
        : [];
      const nonSiteIdx = handAfterSite.findIndex(
        (c) =>
          c &&
          typeof c.type === "string" &&
          !c.type.toLowerCase().includes("site")
      );
      if (nonSiteIdx !== -1) {
        const card = handAfterSite.splice(nonSiteIdx, 1)[0];
        myZones.hand = handAfterSite;
        const at = placedCell || findAnyEmptyCell();
        patch.permanents = patch.permanents || {};
        const existing =
          (this._game.permanents && this._game.permanents[at]) || [];
        patch.permanents[at] = [
          ...existing,
          { owner: myNum, card, tapped: false },
        ];
      }

      // Apply zones patch for me
      patch.zones[meKey] = myZones;

      // Send action
      try {
        const toSend = this._hydratePatchCardRefs(patch);
        this.socket.emit("action", { action: toSend });
      } catch {}

      // Mark acted this turn and schedule end-turn after a short delay
      this._actedTurn.add(turnKey);
      setTimeout(() => {
        try {
          const other = myNum === 1 ? 2 : 1;
          this.socket.emit("action", {
            action: { currentPlayer: other, phase: "Main" },
          });
        } catch {}
      }, 500);

      // Fallback: if currentPlayer didn't flip after 1.2s, try once more
      setTimeout(() => {
        try {
          if (!this._game) return;
          if (this._game.currentPlayer === myNum) {
            const other = myNum === 1 ? 2 : 1;
            this.socket.emit("action", {
              action: { currentPlayer: other, phase: "Main" },
            });
          }
        } catch {}
      }, 1200);
    } catch (e) {
      console.warn("[Bot] _maybeAct error:", e);
    }
  }

  _ensureMulliganAfterWaiting() {
    try {
      const m = this.currentMatch;
      if (!m || m.status !== "waiting") return;
      if (this._mulliganDoneSent.has(m.id) || this._mulliganScheduled.has(m.id))
        return;
      this._mulliganScheduled.add(m.id);
      setTimeout(() => {
        try {
          // Re-check current match and status to avoid stale timers
          const cur = this.currentMatch;
          if (!cur || cur.id !== m.id || cur.status !== "waiting") return;
          if (!this._mulliganDoneSent.has(cur.id)) {
            this.socket.emit("mulliganDone", {});
            this._mulliganDoneSent.add(cur.id);
          }
        } catch {}
      }, 600 + Math.floor(Math.random() * 600));
    } catch {}
  }

  _startMulliganKeepalive(matchId) {
    try {
      if (!matchId) return;
      if (this._mulliganKeepalive.has(matchId)) return;
      const timer = setInterval(() => {
        try {
          // Stop once Main is observed
          if (this._game && this._game.phase === "Main") {
            this._stopMulliganKeepalive(matchId);
            return;
          }
          this.socket &&
            this.socket.emit &&
            this.socket.emit("mulliganDone", {});
        } catch {}
      }, 700);
      this._mulliganKeepalive.set(matchId, timer);
    } catch {}
  }

  _stopMulliganKeepalive(matchId) {
    try {
      const t = this._mulliganKeepalive.get(matchId);
      if (t) {
        clearInterval(t);
        this._mulliganKeepalive.delete(matchId);
      }
    } catch {}
  }

  _rollD20IfNeeded() {
    try {
      const match = this.currentMatch;
      if (!match || !this.socket) return;
      const meKey = this.playerIndex === 1 ? "p2" : "p1";
      const r = this._d20Last || { p1: null, p2: null };
      if (r[meKey] == null && !this._d20Rolled.has(match.id)) {
        const roll = 1 + Math.floor(Math.random() * 20);
        this._d20Rolled.add(match.id);
        this.socket.emit("action", { action: { d20Rolls: { [meKey]: roll } } });
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
          const packsForMe = Array.isArray(state.allGeneratedPacks?.[meIdx])
            ? state.allGeneratedPacks[meIdx]
            : [];
          const firstPack = packsForMe.find(
            (p) => Array.isArray(p) && p.length > 0
          );
          const setChoice =
            (firstPack && (firstPack[0]?.setName || firstPack[0]?.set)) ||
            "Beta";
          this.socket.emit("chooseDraftPack", {
            matchId,
            setChoice,
            packIndex: state.packIndex || 0,
          });
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
        const myPack = Array.isArray(state.currentPacks?.[meIdx])
          ? state.currentPacks[meIdx]
          : [];
        if (!myPack.length) return;
        this._updatePreferredElements(state);
        const scored = myPack
          .map((card) => ({ card, score: this._scoreDraftCard(card) }))
          .sort((a, b) => b.score - a.score);
        const pick = scored[0]?.card;
        if (pick) {
          const pk = `${matchId}:${state.packIndex || 0}:${
            state.pickNumber || 1
          }`;
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
        const picks = Array.isArray(state.picks?.[meIdx])
          ? state.picks[meIdx]
          : [];
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
              setTimeout(
                () => this.socket.emit("mulliganDone", {}),
                1000 + Math.floor(Math.random() * 500)
              );
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
      const myPicks = Array.isArray(state.picks?.[meIdx])
        ? state.picks[meIdx]
        : [];
      const counts = new Map();
      for (const c of myPicks) {
        const els = Array.isArray(c?.element) ? c.element : [];
        for (const e of els) counts.set(e, (counts.get(e) || 0) + 1);
      }
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([e]) => String(e));
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
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([e]) => String(e));
      if (top.length) this.preferredElements = top;
    } catch {}
  }

  _scoreDraftCard(card) {
    const t = String(card?.type || "").toLowerCase();
    const isSite = t.includes("site");
    const isAvatar = t.includes("avatar");
    let score = 0;
    const els = Array.isArray(card?.element) ? card.element : [];
    for (const e of els)
      if (this.preferredElements.includes(String(e))) score += 10;
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
    const isSite = (t) =>
      String(t || "")
        .toLowerCase()
        .includes("site");
    const isAvatar = (t) =>
      String(t || "")
        .toLowerCase()
        .includes("avatar");

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
      type: forceSite ? "Site" : c.type || null,
    };
  }

  _fallbackSpellslinger() {
    // Prefer Spellslinger first (important standard avatar), then other real Beta avatars
    const candidates = [
      "Spellslinger",
      "Geomancer",
      "Flamecaller",
      "Sparkmage",
      "Waveshaper",
    ];
    for (const name of candidates) {
      const slug = this._getSlugForName(name);
      if (slug) {
        return {
          id: `avatar_${name.toLowerCase()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          name,
          type: "Avatar",
          set: "Beta",
          slug,
        };
      }
    }
    // Fallback: pick any Avatar from DB if present
    const any = this._chooseAvatarCardRef();
    if (any) return any;
    // Last resort: placeholder without slug (server will treat as generic avatar)
    return {
      id: `avatar_placeholder_${Math.random().toString(36).slice(2, 8)}`,
      name: "Avatar",
      type: "Avatar",
      set: "Beta",
    };
  }

  _standardSites(preferred = []) {
    // Return standard site card refs with real slugs, biased by preferred elements
    const map = {
      Air: "Spire",
      Water: "Stream",
      Earth: "Valley",
      Fire: "Wasteland",
    };
    const all = ["Spire", "Stream", "Valley", "Wasteland"];
    const chosen = [];
    for (const e of preferred) {
      const n = map[String(e)] || null;
      if (n) chosen.push(n);
    }
    if (chosen.length < 2) chosen.push("Spire", "Stream");
    const sequence = chosen.length ? chosen : all;
    return sequence.map((n, i) => {
      const slug = this._getSlugForName(n);
      return {
        id: `std_site_${i}_${Math.random().toString(36).slice(2, 6)}`,
        name: n,
        type: "Site",
        set: "Beta",
        slug: slug || undefined,
      };
    });
  }

  // Build a 24/12 constructed deck using real slugs
  _buildConstructedDeckFromData() {
    const db = _loadCardsDb();
    // Pick 24 cards biased toward permanents/units (avoid spell-heavy builds)
    const want = 24;
    const preferred = Array.isArray(this.preferredElements)
      ? this.preferredElements
      : [];
    const typeOf = (c) =>
      c?.guardian?.type || c?.sets?.[0]?.metadata?.type || "";
    const isSite = (t) =>
      String(t || "")
        .toLowerCase()
        .includes("site");
    const isAvatar = (t) =>
      String(t || "")
        .toLowerCase()
        .includes("avatar");
    const isSpell = (t) =>
      String(t || "")
        .toLowerCase()
        .includes("spell");
    const isPermanent = (t) => {
      const s = String(t || "").toLowerCase();
      if (!s) return false;
      if (isSite(s) || isAvatar(s) || isSpell(s)) return false;
      // Treat all non-site, non-avatar, non-spell as board permanents (minions, relics, structures, etc.)
      return true;
    };
    const permanents = [];
    const nonPermanents = [];
    for (const c of db) {
      try {
        const t = typeOf(c);
        if (isSite(t) || isAvatar(t)) continue;
        if (isPermanent(t)) permanents.push(c);
        else nonPermanents.push(c);
      } catch {}
    }
    // Score function: prefer preferred elements and lower cost
    const scoreCard = (c) => {
      const el = String(c?.elements || "").toLowerCase();
      let score = 0;
      for (const e of preferred)
        if (el.includes(String(e).toLowerCase())) score += 10;
      const cost =
        Number(c?.guardian?.cost || c?.sets?.[0]?.metadata?.cost || 0) || 0;
      score += Math.max(0, 6 - cost);
      return score;
    };
    const sortByScoreDesc = (arr) =>
      arr
        .map((c) => ({ c, s: scoreCard(c) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.c);
    const permSorted = sortByScoreDesc(permanents);
    const nonPermSorted = sortByScoreDesc(nonPermanents);
    const chosen = [];
    for (const c of permSorted) {
      if (chosen.length >= want) break;
      chosen.push(c);
    }
    for (const c of nonPermSorted) {
      if (chosen.length >= want) break;
      chosen.push(c);
    }
    const book = chosen
      .slice(0, want)
      .map((c, idx) => this._toRefFromDb(c, idx));

    // Build 12 standard sites using real slugs
    const atlas = [];
    const std = this._standardSites(preferred);
    let idx = 0;
    while (atlas.length < 12) {
      atlas.push(std[idx % std.length]);
      idx++;
    }

    return { book, atlas };
  }

  _loadConstructedDeckFromFile(filePath) {
    try {
      const abs = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);
      if (!fs.existsSync(abs)) return null;
      const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
      const sb = Array.isArray(raw && raw.spellbook) ? raw.spellbook : [];
      const at = Array.isArray(raw && raw.atlas) ? raw.atlas : [];
      const book = [];
      const atlas = [];
      const pushMany = (arr, ref, n) => {
        for (let i = 0; i < n; i++) arr.push(ref);
      };
      for (const e of sb) {
        try {
          const name = String((e && e.name) || "");
          const count = Math.max(1, Number((e && e.count) || 1));
          if (!name) continue;
          const slug = this._getSlugForName(name);
          const ref = {
            id: `${name.replace(/\s+/g, "_").toLowerCase()}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
            name,
            type: null,
            set: "Beta",
            slug: slug || undefined,
          };
          pushMany(book, ref, count);
        } catch {}
      }
      for (const e of at) {
        try {
          const name = String((e && e.name) || "");
          const count = Math.max(1, Number((e && e.count) || 1));
          if (!name) continue;
          const slug = this._getSlugForName(name);
          const ref = {
            id: `${name.replace(/\s+/g, "_").toLowerCase()}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
            name,
            type: "Site",
            set: "Beta",
            slug: slug || undefined,
          };
          pushMany(atlas, ref, count);
        } catch {}
      }
      if (book.length === 0 || atlas.length === 0) return null;
      return { book, atlas };
    } catch {
      return null;
    }
  }

  _buildDeckFromConfig(config) {
    try {
      const sb = Array.isArray(config && config.spellbook)
        ? config.spellbook
        : [];
      const at = Array.isArray(config && config.atlas) ? config.atlas : [];
      const book = [];
      const atlas = [];
      const pushMany = (arr, ref, n) => {
        for (let i = 0; i < n; i++) arr.push(ref);
      };
      for (const e of sb) {
        try {
          const name = String((e && e.name) || "");
          const count = Math.max(1, Number((e && e.count) || 1));
          if (!name) continue;
          const slug = this._getSlugForName(name);
          const ref = {
            id: `${name.replace(/\s+/g, "_").toLowerCase()}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
            name,
            type: null,
            set: "Beta",
            slug: slug || undefined,
          };
          // CRITICAL: Enrich with cost, thresholds, and type for bot engine validation
          const enriched = this._hydrateCardRef(ref);
          if (!enriched.cost) enriched.cost = this._getCostForCardRef(enriched);
          pushMany(book, enriched, count);
        } catch {}
      }
      for (const e of at) {
        try {
          const name = String((e && e.name) || "");
          const count = Math.max(1, Number((e && e.count) || 1));
          if (!name) continue;
          const slug = this._getSlugForName(name);
          const ref = {
            id: `${name.replace(/\s+/g, "_").toLowerCase()}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
            name,
            type: "Site",
            set: "Beta",
            slug: slug || undefined,
          };
          // CRITICAL: Enrich with thresholds for threshold validation
          const enriched = this._hydrateCardRef(ref);
          // CRITICAL: Sites are free to play (played via Avatar ability), so explicitly set cost to 0
          enriched.cost = 0;
          pushMany(atlas, enriched, count);
        } catch {}
      }
      if (book.length === 0 || atlas.length === 0) return null;
      return { book, atlas };
    } catch {
      return null;
    }
  }

  _toRefFromDb(card, serial = 0) {
    const name = String(card?.name || "Card");
    const type =
      String(card?.guardian?.type || card?.sets?.[0]?.metadata?.type || "") ||
      null;
    const { slug, setName } = this._chooseVariantForCard(card);
    const thresholds = this._extractThresholdsFromDbCard(card) || undefined;
    return {
      id: `${name.replace(/\s+/g, "_").toLowerCase()}_${serial}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      name,
      type,
      set: setName || "Beta",
      slug: slug || undefined,
      thresholds,
    };
  }

  _chooseVariantForCard(card, preferSets = ["Beta", "Alpha"]) {
    try {
      const sets = Array.isArray(card?.sets) ? card.sets : [];
      let chosen = null;
      for (const s of preferSets) {
        const found = sets.find((x) => String(x?.name) === s);
        if (found) {
          chosen = found;
          break;
        }
      }
      if (!chosen && sets.length) chosen = sets[0];
      const variants = Array.isArray(chosen?.variants) ? chosen.variants : [];
      const pickStandard = (pred) =>
        variants.find(
          (x) =>
            String(x?.finish) === "Standard" &&
            pred(String(x?.product || "").toLowerCase())
        );
      // Preference order: Standard Booster > Standard Draft Kit > any Standard > any
      let v =
        pickStandard((p) => p.includes("booster")) ||
        pickStandard(
          (p) => p.includes("draft_kit") || p.includes("draft kit")
        ) ||
        variants.find((x) => String(x?.finish) === "Standard") ||
        variants[0];
      return {
        slug: v?.slug ? String(v.slug) : null,
        setName: chosen?.name ? String(chosen.name) : null,
      };
    } catch {
      return { slug: null, setName: null };
    }
  }

  _getSlugForName(name, preferSets = ["Beta", "Alpha"]) {
    const db = _loadCardsDb();
    const card = db.find(
      (c) =>
        String(c?.name || "").toLowerCase() === String(name || "").toLowerCase()
    );
    if (!card) return null;
    const { slug } = this._chooseVariantForCard(card, preferSets);
    return slug || null;
  }

  _extractThresholdsFromDbCard(card) {
    try {
      const meta =
        card?.guardian ||
        (Array.isArray(card?.sets) && card.sets.length > 0
          ? card.sets[0]?.metadata
          : null);
      const th = meta && meta.thresholds ? meta.thresholds : null;
      if (th && typeof th === "object")
        return {
          air: th.air || 0,
          water: th.water || 0,
          earth: th.earth || 0,
          fire: th.fire || 0,
        };
    } catch {}
    return null;
  }

  _getThresholdsForCard(card) {
    try {
      const db = _loadCardsDb();
      const slug = card && card.slug ? String(card.slug) : null;
      if (slug) {
        for (const c of db) {
          const sets = Array.isArray(c?.sets) ? c.sets : [];
          for (const s of sets) {
            const vs = Array.isArray(s?.variants) ? s.variants : [];
            if (vs.find((v) => String(v.slug) === slug))
              return this._extractThresholdsFromDbCard(c);
          }
        }
      }
      const nm = card && card.name ? String(card.name) : null;
      if (nm) {
        const found = db.find(
          (c) => String(c?.name || "").toLowerCase() === nm.toLowerCase()
        );
        if (found) return this._extractThresholdsFromDbCard(found);
      }
    } catch {}
    return null;
  }

  _chooseAvatarCardRef() {
    const db = _loadCardsDb();
    // Prefer Spellslinger first; then other known avatars
    const preferred = [
      "Spellslinger",
      "Geomancer",
      "Flamecaller",
      "Sparkmage",
      "Waveshaper",
    ];
    for (const name of preferred) {
      const slug = this._getSlugForName(name);
      if (slug)
        return {
          id: `avatar_${name.toLowerCase()}_${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          name,
          type: "Avatar",
          set: "Beta",
          slug,
        };
    }
    const avatar = db.find((c) =>
      String(c?.guardian?.type || c?.sets?.[0]?.metadata?.type || "")
        .toLowerCase()
        .includes("avatar")
    );
    if (avatar) {
      const name = String(avatar.name || "Avatar");
      const { slug, setName } = this._chooseVariantForCard(avatar);
      return {
        id: `avatar_${name.replace(/\s+/g, "_").toLowerCase()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        name,
        type: "Avatar",
        set: setName || "Beta",
        slug: slug || undefined,
      };
    }
    return null;
  }
}

module.exports = { BotClient };
