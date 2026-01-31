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

// name (lowercase) → { cardId: number, variantId: number|null } lookup from DB
// Loaded once via BotClient.loadCardIdMap() before matches start
let _CARD_ID_MAP = null;

/**
 * Load card name → { cardId, variantId } mapping from database.
 * Must be called once before bots start playing.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function loadCardIdMap(prisma) {
  if (_CARD_ID_MAP) return _CARD_ID_MAP;
  try {
    // Get all cards with their first variant for a valid variantId
    const cards = await prisma.card.findMany({
      select: { id: true, name: true, variants: { select: { id: true }, take: 1 } },
    });
    _CARD_ID_MAP = {};
    for (const c of cards) {
      if (!c.name) continue;
      const variantId = (c.variants && c.variants.length > 0) ? c.variants[0].id : null;
      _CARD_ID_MAP[c.name.toLowerCase()] = { cardId: c.id, variantId };
    }
    console.log(`[Bot] Loaded card ID map: ${Object.keys(_CARD_ID_MAP).length} cards`);
    return _CARD_ID_MAP;
  } catch (e) {
    console.warn("[Bot] Failed to load card ID map:", e?.message || e);
    _CARD_ID_MAP = {};
    return _CARD_ID_MAP;
  }
}

function getCardIds(name) {
  if (!_CARD_ID_MAP || !name) return null;
  return _CARD_ID_MAP[name.toLowerCase()] || null;
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
    this._seerCompleted = new Set(); // matchId — tracks if bot already handled seer

    // Join guards
    this._joinedMatch = new Set(); // matchId

    // Match end tracking (readable by selfplay observer)
    this._gameEnded = false;
    this._gameWinner = null;

    // Live game tracking for basic AI
    this._game = null; // last merged server snapshot for current match
    this._lastCurrentPlayer = null;
    this._turnIndex = 0; // increments when currentPlayer changes
    this._actedTurn = new Set(); // `${matchId}:${turnIndex}` — only set when we PASS (end turn)
    this._turnActionCount = new Map(); // turnKey → number of actions sent this turn
    this._pendingAction = false; // true while waiting for server response after sending an action
    this._summonedCells = new Map(); // cellKey → turnIndex — tracks cells where units were placed this turn
    this._startPhaseHandled = new Set(); // turnKey — tracks which turns already had Start phase processed
    this._startedAsFirst = false; // true if we were the first player when Start applied
    this._constructedInitDone = new Set(); // matchId
    this._localZones = null; // { meKey, zones } - backup of locally-built deck zones
    this._localZonesApplied = false; // true once server has acknowledged our zones
    // Bot rules
    this._botRules = null;
    // Combat protocol state
    this._pendingCombats = new Map(); // combatId -> { meta, status, myRole }
    // Combat life tracking (separate from game state, which gets overwritten by server patches)
    this._combatLife = { p1: 20, p2: 20 };
  }

  async start() {
    if (this.socket) return;

    const socket = io(this.serverUrl, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      auth: { clientVersion: 2 },
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
      const meKey = this.playerIndex === 1 ? "p2" : "p1";
      console.log(`[Bot] Resolved seat: playerIndex=${this.playerIndex}, meKey=${meKey}, myId=${this.you?.id}, players=${JSON.stringify(match.players)}`);
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

      // Auto-opt-in to combat and magic guides for human-friendly play
      setTimeout(() => {
        try {
          const guideKey = this.playerIndex === 1 ? "p2" : "p1";
          this.socket.emit("message", {
            type: "guidePref",
            seat: guideKey,
            combatGuides: true,
            magicGuides: true,
          });
        } catch {}
      }, 500);

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
        // Re-apply constructed deck zones after merge (server patches may overwrite them)
        this._ensureLocalZonesApplied();
        // Clear pending flag so _maybeAct can run the next action in multi-action turns
        this._pendingAction = false;
        this._maybeAct();
      } catch (err) {
        console.warn("[Bot] statePatch handler error:", err);
      }
    });

    // Match ended event — mark game as over
    socket.on("matchEnded", (data) => {
      try {
        this._gameEnded = true;
        if (data && data.winnerId) this._gameWinner = data.winnerId;
        console.log(`[Bot] matchEnded event received:`, JSON.stringify(data));
      } catch {}
    });

    // Resync with full snapshot — preserve local combat state (life, graveyard)
    socket.on("resyncResponse", (payload = {}) => {
      try {
        const snap = payload && payload.snapshot ? payload.snapshot : null;
        if (snap && snap.game) {
          // Preserve local life tracking (combat is client-side, server doesn't track it)
          const prevPlayers = this._game && this._game.players ? JSON.parse(JSON.stringify(this._game.players)) : null;
          this._game = JSON.parse(JSON.stringify(snap.game));
          // Restore life values if we had local tracking (lower life = more accurate)
          if (prevPlayers && this._game.players) {
            for (const key of ["p1", "p2"]) {
              const prev = prevPlayers[key];
              const curr = this._game.players[key];
              if (prev && curr && typeof prev.life === "number" && typeof curr.life === "number") {
                if (prev.life < curr.life) {
                  curr.life = prev.life; // Keep the lower (combat-damaged) life
                }
              }
            }
          }
          // Initialize turn tracking from snapshot
          if (this._game && typeof this._game.currentPlayer === "number") {
            this._lastCurrentPlayer = this._game.currentPlayer;
          }
          // Re-apply local deck zones if server snapshot has empty zones
          this._ensureLocalZonesApplied();
          // Re-enforce summoning sickness after full snapshot replacement
          this._reenforceSummoningSickness();
          this._maybeAct();
        }
      } catch (e) {
        console.warn("[Bot] resyncResponse error:", e);
      }
    });

    // Server error handling — request resync to fix local state after rejected actions
    socket.on("error", (e) => {
      console.warn("[Bot] server error:", e);
      // If action was rejected (cost_unpaid, etc.), our optimistic merge is wrong
      // Request a full state resync from the server
      try {
        this._pendingAction = false;
        socket.emit("resyncRequest", {});
      } catch {}
    });

    // Message protocol: handle resolver messages, combat, and guides
    socket.on("message", (payload) => {
      try {
        if (!payload || typeof payload !== "object") return;
        const type = payload.type;
        if (!type) return;
        if (type === "guidePref") return; // Acknowledge guide preferences, no action needed
        // Try resolver messages first (custom card interactions)
        if (this._handleResolverMessage(type, payload)) return;
        this._handleCombatMessage(type, payload);
      } catch (e) {
        try { console.warn("[Bot] message handler error:", e.message || e); } catch {}
      }
    });

    // Interaction consent: auto-approve all interaction requests directed at this bot
    // (toolbox, move site, take from cemetery, etc.)
    socket.on("interaction", (envelope) => {
      try {
        if (!envelope || typeof envelope !== "object") return;
        const msg = envelope.message;
        if (!msg || msg.type !== "interaction:request") return;
        // Only respond to requests directed at us
        if (msg.to !== this.playerId) return;

        console.log(`[Bot] Interaction request received: kind=${msg.kind} from=${msg.from} reqId=${msg.requestId}`);

        // Auto-approve with permissive grant after a short delay (simulate thinking)
        setTimeout(() => {
          try {
            socket.emit("interaction:response", {
              requestId: msg.requestId,
              decision: "approved",
              matchId: msg.matchId,
              from: this.playerId,
              to: msg.from,
              kind: msg.kind,
              respondedAt: Date.now(),
              grant: {
                singleUse: true,
                allowOpponentZoneWrite: true,
                allowRevealOpponentHand: true,
              },
            });
            console.log(`[Bot] Auto-approved interaction ${msg.requestId} (${msg.kind})`);
          } catch (e) {
            try { console.warn("[Bot] Failed to send interaction response:", e.message || e); } catch {}
          }
        }, 500);
      } catch (e) {
        try { console.warn("[Bot] interaction handler error:", e.message || e); } catch {}
      }
    });

    // Periodic nudge: retry acting or resend pass if stuck, and resync state
    this._lastResyncAt = 0;
    this._nudgeTimer = setInterval(() => {
      try {
        if (!this._game || !this.currentMatch) return;
        const myNum = this.playerIndex === 1 ? 2 : 1;

        // NOTE: Periodic resync disabled — it resets local combat life tracking.
        // Combat resolution is now fully client-side via the message protocol.

        if (this._game.currentPlayer !== myNum) return;

        const turnKey = `${this.currentMatch.id}:${this._turnIndex}`;
        if (this._actedTurn.has(turnKey)) {
          // We already passed but currentPlayer didn't change — resend pass
          const other = myNum === 1 ? 2 : 1;
          this.socket.emit("action", {
            action: { currentPlayer: other, phase: "Start" },
          });
          // Also merge locally
          try {
            this._mergeGamePatch({ currentPlayer: other, phase: "Start" });
          } catch {}
        } else if (!this._pendingAction) {
          // Our turn but not acting — retry
          this._maybeAct();
        }
      } catch {}
    }, 3000);
  }

  stop() {
    try {
      if (this._nudgeTimer) clearInterval(this._nudgeTimer);
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
      // Handle both object format ({id: 'cpu_A'}) and string format ('cpu_A')
      const pid = p && typeof p === "object" ? p.id : p;
      if (pid === me) return i;
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

      // Handle Seer phase — if bot is the second seat, auto-complete the seer
      this._handleSeerPatch(patch);

      // Detect match end from server state patch
      if (patch && typeof patch === "object" && patch.matchEnded) {
        this._gameEnded = true;
        if (patch.winner) this._gameWinner = patch.winner;
        console.log(`[Bot] Match ended via statePatch. Winner: ${patch.winner || "unknown"}`);
      }

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

  /**
   * Handle the Seer phase (second player scry).
   * If the bot is the second seat and seer is pending, auto-complete it.
   * The bot always skips seer to avoid complexity — it's a minor advantage.
   */
  _handleSeerPatch(patch) {
    try {
      if (!patch || typeof patch !== "object") return;

      // Check if this patch contains seerState
      const seerState = patch.seerState;
      if (!seerState) return;

      const cur = this.currentMatch;
      if (!cur) return;
      if (this._seerCompleted.has(cur.id)) return;

      const meKey = this.playerIndex === 1 ? "p2" : "p1";

      // If seer is already complete, nothing to do
      if (seerState.setupComplete) {
        this._seerCompleted.add(cur.id);
        console.log("[Bot Seer] Seer phase already complete.");
        return;
      }

      // Only the second seat needs to act
      if (seerState.secondSeat !== meKey) {
        console.log("[Bot Seer] Not second seat, waiting for opponent to complete seer.");
        return;
      }

      // Bot is the second seat — auto-complete seer by skipping
      this._seerCompleted.add(cur.id);
      console.log("[Bot Seer] Bot is second seat — auto-completing seer (skip).");

      // Send the completed seer state patch after a short delay
      setTimeout(() => {
        try {
          const completedSeerState = {
            secondSeat: meKey,
            status: "skipped",
            chosenPile: "spellbook",
            decision: "skip",
            setupComplete: true,
          };
          this.socket.emit("action", {
            action: { seerState: completedSeerState },
          });
          console.log("[Bot Seer] Sent seer skip patch.");
        } catch (e) {
          console.error("[Bot Seer] Error sending seer skip:", e);
        }
      }, 500);
    } catch (e) {
      console.error("[Bot Seer] Error handling seer patch:", e);
    }
  }

  /**
   * Proactively initiate and complete seer if bot is second seat.
   * Called after mulligan is done and phase enters waiting/seer.
   */
  _initiateSeerIfNeeded() {
    try {
      const cur = this.currentMatch;
      if (!cur) return;
      if (this._seerCompleted.has(cur.id)) return;

      const meKey = this.playerIndex === 1 ? "p2" : "p1";
      // Determine second seat from currentPlayer
      const game = this._game;
      if (!game) return;
      const currentPlayer = game.currentPlayer;
      // Second seat = whoever goes second. currentPlayer indicates who goes first.
      // If currentPlayer is 1, p1 goes first, p2 is second seat.
      // If currentPlayer is 2, p2 goes first, p1 is second seat.
      const secondSeat = currentPlayer === 1 ? "p2" : currentPlayer === 2 ? "p1" : null;
      if (!secondSeat || secondSeat !== meKey) return;

      this._seerCompleted.add(cur.id);
      console.log("[Bot Seer] Bot is second seat — proactively initiating and skipping seer.");

      setTimeout(() => {
        try {
          const completedSeerState = {
            secondSeat: meKey,
            status: "skipped",
            chosenPile: "spellbook",
            decision: "skip",
            setupComplete: true,
          };
          this.socket.emit("action", {
            action: { seerState: completedSeerState },
          });
          console.log("[Bot Seer] Sent proactive seer skip patch.");
        } catch (e) {
          console.error("[Bot Seer] Error in proactive seer:", e);
        }
      }, 1000);
    } catch (e) {
      console.error("[Bot Seer] Error in _initiateSeerIfNeeded:", e);
    }
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

      // Place avatar on the board with canonical position
      const avatarCardRef = this._chooseAvatarCardRef();
      if (avatarCardRef) {
        const w = (this._game && this._game.board && this._game.board.size && this._game.board.size.w) || 5;
        const h = (this._game && this._game.board && this._game.board.size && this._game.board.size.h) || 5;
        const cx = Math.floor(Math.max(1, Number(w) || 5) / 2);
        // p1 is at bottom (h-1), p2 is at top (0)
        const yy = meKey === "p1" ? (Number(h) || 5) - 1 : 0;
        patch.avatars = {
          [meKey]: {
            card: avatarCardRef,
            pos: [cx, yy],
            offset: null,
            tapped: false,
          },
        };
        try {
          console.log(`[Bot] Placing avatar "${avatarCardRef.name}" at [${cx}, ${yy}] for ${meKey}`);
        } catch {}
      }

      try {
        const hydrated = this._hydratePatchCardRefs(patch);
        // DEBUG: Log initial deck setup
        try {
          const siteCount = myZones.hand.filter(c => c && typeof c.type === 'string' && c.type.toLowerCase().includes('site')).length;
          console.log(
            "[Bot] Initial deck setup - hand:",
            myZones.hand.length,
            "(sites:", siteCount + ")",
            "spellbook:",
            myZones.spellbook.length,
            "atlas:",
            myZones.atlas.length
          );
        } catch {}
        // Store backup of locally-built zones - _ensureLocalZonesApplied() will
        // re-apply these after every _mergeGamePatch() since server patches can
        // overwrite our local zones before the server acknowledges them.
        this._localZones = { meKey, zones: JSON.parse(JSON.stringify(hydrated.zones[meKey])) };
        this._localZonesApplied = false;
        this.socket.emit("action", { action: hydrated });
        this._constructedInitDone.add(mid);
        // Also apply immediately for the current call
        if (!this._game) this._game = {};
        if (!this._game.zones) this._game.zones = {};
        this._game.zones[meKey] = JSON.parse(JSON.stringify(this._localZones.zones));
        // Apply avatar placement to local state immediately
        if (hydrated.avatars && hydrated.avatars[meKey]) {
          if (!this._game.avatars) this._game.avatars = {};
          this._game.avatars[meKey] = JSON.parse(JSON.stringify(hydrated.avatars[meKey]));
        }
        try {
          console.log("[Bot] Initialized constructed deck, opening hand, and avatar placement");
        } catch {}
      } catch {}
    } catch {}
  }

  /**
   * Re-apply locally-built deck zones after _mergeGamePatch() which may overwrite them.
   * Once the server sends back zones with actual cards (hand.length > 0), we stop overriding.
   */
  _ensureLocalZonesApplied() {
    try {
      if (!this._localZones || this._localZonesApplied) return;
      const { meKey, zones } = this._localZones;
      if (!this._game || !this._game.zones) return;
      const serverZones = this._game.zones[meKey];
      // If server already has our cards (hand not empty), stop overriding
      if (serverZones && Array.isArray(serverZones.hand) && serverZones.hand.length > 0) {
        this._localZonesApplied = true;
        return;
      }
      // Server zones are empty/missing - re-apply our local deck
      this._game.zones[meKey] = JSON.parse(JSON.stringify(zones));
      try {
        console.log(`[Bot] Re-applied local deck zones (hand=${zones.hand.length})`);
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
    if (patch.permanents) {
      for (const key in patch.permanents) {
        const arr = patch.permanents[key];
        if (Array.isArray(arr)) {
          for (const perm of arr) {
            if (perm && perm.card) {
              perm.card = this._hydrateCardRef(perm.card);
            }
          }
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
    // Attach attack/defence stats from cards DB for combat resolution
    try {
      if (card.name && (card.attack === undefined || card.attack === null)) {
        const stats = this._getStatsForCard(card);
        if (stats) {
          if (stats.attack !== undefined) card.attack = stats.attack;
          if (stats.defence !== undefined) card.defence = stats.defence;
        }
      }
    } catch {}
    // Attach rulesText from cards DB for spell effect parsing
    try {
      if (card.name && !card.rulesText) {
        const rt = this._getRulesTextForCard(card);
        if (rt) card.rulesText = rt;
      }
    } catch {}
    // Attach cardId and variantId from DB so server accepts zone writes
    try {
      if (card.name && (card.cardId === undefined || card.cardId === null)) {
        const ids = getCardIds(card.name);
        if (ids) {
          card.cardId = ids.cardId;
          if (ids.variantId && !card.variantId) card.variantId = ids.variantId;
        }
      }
    } catch {}
    // Ensure instanceId exists (server requires it)
    if (!card.instanceId) {
      card.instanceId = `bot_${(card.cardId || 0)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    }
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

  /**
   * Get attack/defence for a card, with fallback to cards_raw.json DB lookup.
   */
  _getCardCombatStats(card) {
    if (!card) return { atk: 0, def: 0 };
    // Try direct properties first
    let atk = Number(card.attack);
    let def = Number(card.defence || card.defense);
    if (Number.isFinite(atk) && atk > 0) return { atk, def: Number.isFinite(def) ? def : atk };
    // Fallback: look up in cards DB
    const stats = this._getStatsForCard(card);
    if (stats) return { atk: stats.attack, def: stats.defence };
    return { atk: 0, def: 0 };
  }

  _getStatsForCard(card) {
    try {
      const db = _loadCardsDb();
      const nm = card && card.name ? String(card.name).toLowerCase() : null;
      if (!nm) return null;
      const found = db.find(
        (c) => String(c?.name || "").toLowerCase() === nm
      );
      if (found && found.guardian) {
        return {
          attack: Number(found.guardian.attack) || 0,
          defence: Number(found.guardian.defence) || 0,
        };
      }
    } catch {}
    return null;
  }

  /**
   * Get rules text for a card from cards_raw.json DB.
   */
  _getRulesTextForCard(card) {
    try {
      const db = _loadCardsDb();
      const nm = card && card.name ? String(card.name).toLowerCase() : null;
      if (!nm) return null;
      const found = db.find(
        (c) => String(c?.name || "").toLowerCase() === nm
      );
      if (found) {
        // Try guardian.rulesText, then sets[0].metadata.rulesText
        const rt = found.guardian?.rulesText || found.sets?.[0]?.metadata?.rulesText || null;
        if (rt && typeof rt === "string") return rt;
        // Try variant-level rules text
        if (found.sets) {
          for (const s of found.sets) {
            if (s?.variants) {
              for (const v of s.variants) {
                if (v?.rulesText) return v.rulesText;
              }
            }
          }
        }
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
      // Re-enforce summoning sickness on units placed this turn
      this._reenforceSummoningSickness();
    } catch {}
  }

  /**
   * Emit a toast message to the opponent (human player) so they can see what the bot did.
   * Uses the existing socket message protocol — client handles "botActionToast" type.
   */
  _emitBotToast(message) {
    try {
      this.socket.emit("message", { type: "botActionToast", message, ts: Date.now() });
    } catch {}
  }

  /**
   * Emit the magic flow messages when the bot casts a spell.
   * This communicates intent to the human player's client so it can display
   * the spell casting overlay (magicBegin → magicSetCaster → magicConfirm → magicResolve).
   */
  _emitMagicFlow(spellCard, meKey) {
    try {
      const magicId = `mag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const cardName = spellCard.name || "Spell";
      // Find a cell to place the spell at (any owned site)
      const board = (this._game && this._game.board) || {};
      const sites = board.sites || {};
      const myNum = meKey === "p1" ? 1 : 2;
      let spellTile = null;
      for (const key of Object.keys(sites)) {
        if (sites[key] && Number(sites[key].owner) === myNum) {
          const [xs, ys] = key.split(",");
          spellTile = { x: Number(xs), y: Number(ys) };
          break;
        }
      }
      if (!spellTile) spellTile = { x: 2, y: 2 }; // Fallback

      const spellCellKey = `${spellTile.x},${spellTile.y}`;
      // 1. magicBegin — spell appears on the board
      this.socket.emit("message", {
        type: "magicBegin",
        id: magicId,
        tile: spellTile,
        spell: { at: spellCellKey, index: 0, card: spellCard, owner: myNum },
        playerKey: meKey,
        ts: Date.now(),
      });

      // 2. magicSetCaster — avatar is the caster
      setTimeout(() => {
        try {
          const avatarPos = (this._game && this._game.avatars && this._game.avatars[meKey] && this._game.avatars[meKey].pos) || [2, 2];
          this.socket.emit("message", {
            type: "magicSetCaster",
            id: magicId,
            caster: { at: `${avatarPos[0]},${avatarPos[1]}`, index: -1, isAvatar: true, avatarSeat: meKey },
            ts: Date.now(),
          });
        } catch {}
      }, 400);

      // 3. magicConfirm — targeting locked in
      setTimeout(() => {
        try {
          this.socket.emit("message", {
            type: "magicConfirm",
            id: magicId,
            ts: Date.now(),
          });
        } catch {}
      }, 800);

      // 4. toast — show what was cast
      this.socket.emit("message", {
        type: "toast",
        text: `Casting '${cardName}'`,
        seat: meKey,
        ts: Date.now(),
      });

      // 5. magicResolve — spell resolves (after delay for human to see)
      setTimeout(() => {
        try {
          this.socket.emit("message", {
            type: "magicResolve",
            id: magicId,
            spell: { at: spellCellKey, index: 0, card: spellCard, owner: myNum },
            tile: spellTile,
            ts: Date.now(),
          });
        } catch {}
      }, 1200);

      // 6. Apply spell effect after resolution (delay to let magic flow complete)
      setTimeout(() => {
        try {
          this._applySpellEffect(spellCard, meKey);
        } catch (e) {
          try { console.warn("[Bot Magic] Error applying spell effect:", e?.message || e); } catch {}
        }
      }, 1600);
    } catch {}
  }

  /**
   * Apply the actual game effect of a spell card after it resolves.
   * The human client does this via magicState.ts / custom resolvers;
   * the bot must do it directly by sending appropriate messages/patches.
   */
  _applySpellEffect(spellCard, meKey) {
    if (!spellCard) return;
    const cardName = String(spellCard.name || "").toLowerCase();
    const rulesText = String(spellCard.rulesText || spellCard.text || "").toLowerCase();
    const oppKey = meKey === "p1" ? "p2" : "p1";
    const myNum = meKey === "p1" ? 1 : 2;
    const oppNum = myNum === 1 ? 2 : 1;

    // If card has a custom resolver, emit the resolver Begin message so the
    // existing resolver handler (_handleResolverMessage) will process it.
    if (this._initiateCustomResolver(spellCard, meKey)) return;

    // ── Damage spells ──────────────────────────────────────────────────
    // Parse damage amount from rules text: "deal(s) X damage"
    const dmgMatch = rulesText.match(/deals?\s+(\d+)\s+damage/i) || rulesText.match(/(\d+)\s+damage/i);
    const dmgAmount = dmgMatch ? Math.max(0, Math.floor(Number(dmgMatch[1]))) : 0;

    if (dmgAmount > 0) {
      const target = this._pickDamageTarget(meKey, rulesText);
      if (target) {
        const damageRecords = Array.isArray(target) ? target.map(t => ({ ...t, amount: dmgAmount })) : [{ ...target, amount: dmgAmount }];
        this.socket.emit("message", {
          type: "magicDamage",
          damage: damageRecords,
          ts: Date.now(),
        });
        // Also apply damage locally
        this._applyDamageLocally(damageRecords);
        console.log(`[Bot Magic] ${spellCard.name}: dealt ${dmgAmount} damage to ${damageRecords.length} target(s)`);
        return;
      }
    }

    // ── Life gain spells ───────────────────────────────────────────────
    const lifeMatch = rulesText.match(/gain\s+(\d+)\s+life/i);
    if (lifeMatch) {
      const amount = Number(lifeMatch[1]);
      if (amount > 0) {
        try {
          const players = (this._game && this._game.players) || {};
          const myPlayer = players[meKey] || {};
          const newLife = Math.min(20, (Number(myPlayer.life) || 0) + amount);
          const patch = { players: {} };
          patch.players[meKey] = { ...myPlayer, life: newLife };
          this.socket.emit("action", { action: patch });
          try { this._mergeGamePatch(patch); } catch {}
          console.log(`[Bot Magic] ${spellCard.name}: gained ${amount} life (now ${newLife})`);
        } catch {}
        return;
      }
    }

    // ── Draw spells ────────────────────────────────────────────────────
    const drawMatch = rulesText.match(/draw\s+(\d+)\s+card/i) || rulesText.match(/draw\s+a\s+card/i);
    if (drawMatch) {
      const count = Math.min(Number(drawMatch[1]) || 1, 5);
      try {
        this._botDrawCards(meKey, count, "spellbook");
        console.log(`[Bot Magic] ${spellCard.name}: drew ${count} card(s)`);
      } catch {}
      // Don't return — spell may also have other effects (e.g., Blink: teleport + draw)
    }

    // ── Buff spells (e.g., +N ATK/DEF) ────────────────────────────────
    const buffMatch = rulesText.match(/\+(\d+)\s*(?:\/\s*\+?(\d+))?\s*(?:atk|attack|def|defence|defense|power)/i) ||
                      rulesText.match(/gets?\s+\+(\d+)/i);
    if (buffMatch && !rulesText.includes("damage")) {
      const buffAtk = Number(buffMatch[1]) || 0;
      const buffDef = Number(buffMatch[2] || buffMatch[1]) || 0;
      const target = this._pickFriendlyUnit(meKey);
      if (target) {
        try {
          const perms = (this._game && this._game.permanents) || {};
          const cell = perms[target.at];
          if (cell && cell[target.index]) {
            const unit = cell[target.index];
            const card = unit.card || {};
            const newCard = { ...card };
            if (buffAtk > 0) newCard.attack = (Number(card.attack) || 0) + buffAtk;
            if (buffDef > 0) {
              newCard.defence = (Number(card.defence || card.defense) || 0) + buffDef;
              newCard.defense = newCard.defence;
            }
            const newPerms = { ...perms };
            const newCell = [...cell];
            newCell[target.index] = { ...unit, card: newCard };
            newPerms[target.at] = newCell;
            const patch = { permanents: newPerms };
            this.socket.emit("action", { action: patch });
            try { this._mergeGamePatch(patch); } catch {}
            console.log(`[Bot Magic] ${spellCard.name}: buffed unit at ${target.at} +${buffAtk}/+${buffDef}`);
          }
        } catch {}
        return;
      }
    }

    // ── Destroy/banish spells ──────────────────────────────────────────
    if (rulesText.includes("destroy") || rulesText.includes("banish")) {
      const target = this._pickEnemyUnit(meKey);
      if (target) {
        try {
          const perms = (this._game && this._game.permanents) || {};
          const cell = perms[target.at];
          if (cell && cell[target.index]) {
            const destroyed = cell[target.index];
            const newCell = [...cell];
            newCell.splice(target.index, 1);
            const newPerms = { ...perms };
            newPerms[target.at] = newCell;
            // Add to opponent's graveyard
            const zones = (this._game && this._game.zones) || {};
            const oppZones = zones[oppKey] || {};
            const oppGrave = Array.isArray(oppZones.graveyard) ? [...oppZones.graveyard] : [];
            if (destroyed.card) oppGrave.push(destroyed.card);
            const patch = {
              permanents: newPerms,
              zones: {},
            };
            patch.zones[oppKey] = { ...oppZones, graveyard: oppGrave };
            this.socket.emit("action", { action: patch });
            try { this._mergeGamePatch(patch); } catch {}
            console.log(`[Bot Magic] ${spellCard.name}: destroyed unit at ${target.at}`);
          }
        } catch {}
        return;
      }
    }

    console.log(`[Bot Magic] ${spellCard.name}: no recognized effect applied (rules: "${rulesText.substring(0, 80)}")`);
  }

  /**
   * Check if card has a custom resolver and initiate it.
   * Returns true if a custom resolver was triggered.
   */
  _initiateCustomResolver(spellCard, meKey) {
    const name = String(spellCard.name || "").toLowerCase();
    const myNum = meKey === "p1" ? 1 : 2;

    // Cards with custom resolvers that the bot handles via _handleResolverMessage
    const RESOLVER_CARDS = {
      "browse": "browseBegin",
      "common sense": "commonSenseBegin",
      "call to war": "callToWarBegin",
      "searing truth": "searingTruthBegin",
      "accusation": "accusationBegin",
      "earthquake": "earthquakeBegin",
      "atlantean fate": "atlanteanFateBegin",
      "chaos twister": "chaosTwisterBegin",
      "black mass": "blackMassBegin",
      "pathfinder": "pathfinderBegin",
      "mephistopheles": "mephistophelesBegin",
      "raise dead": "raiseDeadBegin",
      "legion of gall": "legionOfGallBegin",
      "highland princess": "highlandPrincessBegin",
    };

    const resolverType = RESOLVER_CARDS[name];
    if (!resolverType) return false;

    // Build resolver payload based on card type
    try {
      const zones = (this._game && this._game.zones) || {};
      const myZones = zones[meKey] || {};
      const payload = {
        id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        casterSeat: meKey,
        cardName: spellCard.name,
        card: spellCard,
        ts: Date.now(),
      };

      // Browse-specific: reveal top cards from spellbook
      if (name === "browse") {
        const spellbook = Array.isArray(myZones.spellbook) ? myZones.spellbook : [];
        payload.revealedCards = spellbook.slice(0, 4);
      }
      // Common Sense: search for Ordinary minions in spellbook
      else if (name === "common sense") {
        const spellbook = Array.isArray(myZones.spellbook) ? myZones.spellbook : [];
        payload.searchCards = spellbook.filter(c => {
          const t = String(c?.type || c?.guardian?.type || "").toLowerCase();
          const tt = String(c?.typeText || "").toLowerCase();
          return (t.includes("minion") || t.includes("unit")) && tt.includes("ordinary");
        });
      }
      // Call to War: search for Exceptional mortals
      else if (name === "call to war") {
        const spellbook = Array.isArray(myZones.spellbook) ? myZones.spellbook : [];
        payload.searchCards = spellbook.filter(c => {
          const tt = String(c?.typeText || "").toLowerCase();
          return tt.includes("exceptional");
        });
      }
      // Raise Dead: pick from graveyard
      else if (name === "raise dead") {
        const graveyard = Array.isArray(myZones.graveyard) ? myZones.graveyard : [];
        payload.graveyardCards = graveyard.filter(c => {
          const t = String(c?.type || "").toLowerCase();
          return t.includes("minion") || t.includes("unit");
        });
      }
      // Searing Truth: reveal top 2 spellbook cards
      else if (name === "searing truth") {
        const spellbook = Array.isArray(myZones.spellbook) ? myZones.spellbook : [];
        payload.revealedCards = spellbook.slice(0, 2);
      }

      // Emit the Begin message; the bot's own _handleResolverMessage will process it
      // via the server relay broadcast
      this.socket.emit("message", { type: resolverType, ...payload });
      console.log(`[Bot Magic] ${spellCard.name}: initiated custom resolver ${resolverType}`);
      return true;
    } catch (e) {
      try { console.warn("[Bot Magic] Error initiating resolver:", e?.message || e); } catch {}
      return false;
    }
  }

  /**
   * Pick the best enemy target for a damage spell.
   * Returns { kind, at, index } for a permanent or { kind, seat } for an avatar.
   */
  _pickDamageTarget(meKey, rulesText) {
    const oppKey = meKey === "p1" ? "p2" : "p1";
    const oppNum = meKey === "p1" ? 2 : 1;
    const perms = (this._game && this._game.permanents) || {};
    // Area damage: "each unit at", "all units", "each other unit", "damage to each"
    // NOT: "Each deals" (projectile like Firebolts), NOT "unit nearby" (single-target like Chain Lightning)
    const isAreaDmg = rulesText.includes("each unit") || rulesText.includes("each other unit") ||
      rulesText.includes("all unit") || rulesText.includes("all minion") ||
      rulesText.includes("damage to each") || (rulesText.includes("each") && rulesText.includes("at target location"));

    if (isAreaDmg) {
      // Area damage: target all enemy units
      const targets = [];
      for (const cellKey of Object.keys(perms)) {
        const arr = perms[cellKey];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] && Number(arr[i].owner) === oppNum && !arr[i].attachedTo) {
            targets.push({ kind: "permanent", at: cellKey, index: i });
          }
        }
      }
      if (targets.length > 0) return targets;
    }

    // Single target: prefer highest-value enemy unit, fall back to avatar
    let bestTarget = null;
    let bestScore = -Infinity;
    for (const cellKey of Object.keys(perms)) {
      const arr = perms[cellKey];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p || Number(p.owner) !== oppNum || p.attachedTo) continue;
        const card = p.card || {};
        const atk = Number(card.attack) || 0;
        const def = Number(card.defence || card.defense) || 0;
        const cost = Number(card.cost || card.manaCost) || 0;
        const score = atk * 2 + def + cost;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = { kind: "permanent", at: cellKey, index: i };
        }
      }
    }
    if (bestTarget) return bestTarget;

    // Fall back to opponent avatar
    return { kind: "avatar", seat: oppKey };
  }

  /**
   * Pick a friendly unit (for buff spells).
   */
  _pickFriendlyUnit(meKey) {
    const myNum = meKey === "p1" ? 1 : 2;
    const perms = (this._game && this._game.permanents) || {};
    let bestTarget = null;
    let bestScore = -Infinity;
    for (const cellKey of Object.keys(perms)) {
      const arr = perms[cellKey];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p || Number(p.owner) !== myNum || p.attachedTo) continue;
        const card = p.card || {};
        const atk = Number(card.attack) || 0;
        const def = Number(card.defence || card.defense) || 0;
        const score = atk + def;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = { at: cellKey, index: i };
        }
      }
    }
    return bestTarget;
  }

  /**
   * Pick an enemy unit (for destroy/banish spells).
   */
  _pickEnemyUnit(meKey) {
    const oppNum = meKey === "p1" ? 2 : 1;
    const perms = (this._game && this._game.permanents) || {};
    let bestTarget = null;
    let bestScore = -Infinity;
    for (const cellKey of Object.keys(perms)) {
      const arr = perms[cellKey];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p || Number(p.owner) !== oppNum || p.attachedTo) continue;
        const card = p.card || {};
        const atk = Number(card.attack) || 0;
        const def = Number(card.defence || card.defense) || 0;
        const cost = Number(card.cost || card.manaCost) || 0;
        const score = atk * 2 + def + cost;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = { at: cellKey, index: i };
        }
      }
    }
    return bestTarget;
  }

  /**
   * Apply damage records to local game state (so bot tracks HP correctly).
   */
  _applyDamageLocally(damageRecords) {
    try {
      for (const rec of damageRecords) {
        if (rec.kind === "permanent") {
          const perms = (this._game && this._game.permanents) || {};
          const cell = perms[rec.at];
          if (cell && cell[rec.index]) {
            const unit = cell[rec.index];
            const card = unit.card || {};
            const currentDmg = Number(unit.damage || 0);
            unit.damage = currentDmg + rec.amount;
            // Check if killed (damage >= defence)
            const def = Number(card.defence || card.defense) || 0;
            if (unit.damage >= def && def > 0) {
              // Unit destroyed — remove from board, add to graveyard
              const oppKey = Number(unit.owner) === 1 ? "p1" : "p2";
              cell.splice(rec.index, 1);
              try {
                const zones = (this._game && this._game.zones) || {};
                const oppZones = zones[oppKey] || {};
                const grave = Array.isArray(oppZones.graveyard) ? oppZones.graveyard : [];
                grave.push(card);
              } catch {}
            }
          }
        } else if (rec.kind === "avatar") {
          const players = (this._game && this._game.players) || {};
          const p = players[rec.seat];
          if (p) {
            const current = Number(p.life) || 0;
            p.life = Math.max(0, current - rec.amount);
          }
        }
      }
    } catch {}
  }

  /**
   * Draw cards from a zone (spellbook/atlas) into hand.
   */
  _botDrawCards(meKey, count, fromZone = "spellbook") {
    try {
      const zones = (this._game && this._game.zones) || {};
      const myZones = zones[meKey] || {};
      const source = Array.isArray(myZones[fromZone]) ? [...myZones[fromZone]] : [];
      const hand = Array.isArray(myZones.hand) ? [...myZones.hand] : [];
      const drawn = source.splice(0, Math.min(count, source.length));
      hand.push(...drawn);
      const patch = { zones: {} };
      patch.zones[meKey] = { ...myZones, [fromZone]: source, hand };
      this.socket.emit("action", { action: patch });
      try { this._mergeGamePatch(patch); } catch {}
    } catch {}
  }

  /**
   * Describe an engine patch as a human-readable action string for toasts.
   */
  _describePatch(patch) {
    try {
      if (!patch || typeof patch !== "object") return null;
      // Attack move
      if (patch._attackMeta) {
        const meta = patch._attackMeta;
        const attackerName = meta.attackerCard?.name || "Unit";
        const targetName = meta.targetCard?.name || meta.targetType || "target";
        return `${attackerName} attacks ${targetName}`;
      }
      // Unit placement (permanents + zones = played from hand)
      if (patch.permanents && patch.zones) {
        for (const cellKey of Object.keys(patch.permanents)) {
          const arr = patch.permanents[cellKey];
          if (Array.isArray(arr)) {
            const newest = arr[arr.length - 1];
            if (newest && newest.card) {
              return `Played ${newest.card.name || "a card"}`;
            }
          }
        }
        return "Played a card";
      }
      // Site placement
      if (patch.board && patch.board.sites) {
        for (const cellKey of Object.keys(patch.board.sites)) {
          const site = patch.board.sites[cellKey];
          if (site && site.card) {
            return `Placed ${site.card.name || "a site"}`;
          }
        }
        return "Placed a site";
      }
      // Spell cast
      if (patch._spellCast) {
        return `Cast ${patch._spellCast.name || "a spell"}`;
      }
      // End turn
      if (typeof patch.currentPlayer === "number" && !patch.permanents && !patch.board) {
        return "Ended turn";
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Track that a unit was placed at a cell on the current turn.
   * Called after the engine returns a unit-play patch.
   */
  _trackSummonedUnit(cellKey) {
    try {
      this._summonedCells.set(cellKey, this._turnIndex);
    } catch {}
  }

  /**
   * Clear summoning sickness tracking for a new turn.
   */
  _clearSummoningSickness() {
    try {
      this._summonedCells.clear();
    } catch {}
  }

  /**
   * Re-apply summonedThisTurn flag on permanents that were placed this turn.
   * This guards against server patches or resyncs stripping the flag.
   */
  _reenforceSummoningSickness() {
    try {
      if (!this._game || !this._game.permanents) return;
      const currentTurn = this._turnIndex;
      for (const [cellKey, placedTurn] of this._summonedCells) {
        if (placedTurn !== currentTurn) continue; // Stale entry
        const arr = this._game.permanents[cellKey];
        if (!Array.isArray(arr)) continue;
        const meKey = this.playerIndex === 1 ? "p2" : "p1";
        const myNum = meKey === "p1" ? 1 : 2;
        for (const p of arr) {
          if (p && Number(p.owner) === myNum && !p.summonedThisTurn) {
            p.summonedThisTurn = true;
          }
        }
      }
    } catch {}
  }

  // ── Combat protocol ──────────────────────────────────────────────
  /**
   * Trigger combat after moving a unit to a cell with enemies/sites/avatar.
   * Called from _maybeAct after sending an ATTACK move action.
   */
  _triggerCombat(meta, meKey) {
    try {
      const myNum = meKey === "p1" ? 1 : 2;
      const combatId = `cmb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Determine target type
      const oppSeat = meKey === "p1" ? "p2" : "p1";
      const oppNum = myNum === 1 ? 2 : 1;
      const toKey = meta.toKey;
      const perms = (this._game && this._game.permanents && this._game.permanents[toKey]) || [];
      const sites = (this._game && this._game.board && this._game.board.sites) || {};
      const avatars = (this._game && this._game.avatars) || {};
      const oppAvatar = avatars[oppSeat] || {};
      const oppAvatarPos = oppAvatar.pos || (oppSeat === "p1" ? [2, 4] : [2, 0]);
      const oppAvatarKey = `${oppAvatarPos[0]},${oppAvatarPos[1]}`;

      let target = null;
      // Check for enemy units at destination
      const enemyUnits = Array.isArray(perms)
        ? perms.map((p, i) => ({ p, i })).filter(({ p }) => p && Number(p.owner) === oppNum)
        : [];

      if (enemyUnits.length > 0) {
        // Target the first enemy unit
        target = { kind: "permanent", at: toKey, index: enemyUnits[0].i };
      } else if (toKey === oppAvatarKey) {
        // Attacking the avatar
        target = { kind: "avatar", at: toKey, index: null };
      } else if (sites[toKey] && Number(sites[toKey].owner) === oppNum) {
        // Attacking a site
        target = { kind: "site", at: toKey, index: null };
      }

      if (!target) return; // Nothing to attack

      console.log(`[Bot Combat] Declaring attack: ${combatId} at ${toKey}, target=${target.kind}`);

      const attackerPayload = {
        at: toKey,
        index: meta.attackerIndex,
        owner: myNum,
      };
      // Mark avatar attacks with isAvatar flag (matches client behavior)
      if (meta.isAvatarAttack) {
        attackerPayload.isAvatar = true;
        attackerPayload.avatarSeat = meKey;
      }

      this.socket.emit("message", {
        type: "attackDeclare",
        id: combatId,
        tile: meta.tile,
        attacker: attackerPayload,
        target,
        playerKey: meKey,
        ts: Date.now(),
      });

      // Track this combat — we're the attacker
      this._pendingCombats.set(combatId, {
        ...meta,
        combatId,
        myKey: meKey,
        myNum,
        target,
        role: "attacker",
        status: "declared",
      });
    } catch (e) {
      try { console.warn("[Bot Combat] triggerCombat error:", e.message || e); } catch {}
    }
  }

  // ─── RESOLVER MESSAGE HANDLING ───────────────────────────────────────────
  // Handles custom card resolver messages (Browse, Accusation, etc.)
  // Returns true if the message was consumed, false otherwise.

  /**
   * Dispatch resolver messages to appropriate handlers.
   * @returns {boolean} true if message was handled
   */
  _handleResolverMessage(type, payload) {
    try {
      // Caster-side auto-resolve
      if (type === "browseBegin") return this._handleBrowseBegin(payload), true;
      if (type === "commonSenseBegin") return this._handleCommonSenseBegin(payload), true;
      if (type === "callToWarBegin") return this._handleCallToWarBegin(payload), true;
      if (type === "searingTruthBegin") return this._handleSearingTruthBegin(payload), true;
      if (type === "accusationBegin") return this._handleAccusationBegin(payload), true;
      if (type === "earthquakeBegin") return this._handleEarthquakeBegin(payload), true;
      if (type === "atlanteanFateBegin") return this._handleAtlanteanFateBegin(payload), true;
      if (type === "chaosTwisterBegin") return this._handleChaosTwisterBegin(payload), true;
      if (type === "blackMassBegin") return this._handleBlackMassBegin(payload), true;
      if (type === "doomsdayCultBegin") return this._handleGenericResolverCancel(payload, "doomsdayCult"), true;
      if (type === "pathfinderBegin") return this._handlePathfinderBegin(payload), true;
      if (type === "babelPlacementBegin") return this._handleBabelPlacementBegin(payload), true;
      if (type === "mephistophelesBegin") return this._handleMephistophelesBegin(payload), true;
      if (type === "raiseDeadBegin") return this._handleRaiseDeadBegin(payload), true;
      if (type === "legionOfGallBegin") return this._handleLegionOfGallBegin(payload), true;
      if (type === "highlandPrincessBegin") return this._handleHighlandPrincessBegin(payload), true;

      // Opponent-side response
      if (type === "interrogatorTrigger") return this._handleInterrogatorTrigger(payload), true;
      if (type === "lilithRevealRequest") return this._handleLilithRevealRequest(payload), true;
      if (type === "headlessHauntBegin") return this._handleHeadlessHauntBegin(payload), true;

      // Auto-resolve confirmations
      if (type === "autoResolveBegin") return this._handleAutoResolveBegin(payload), true;

      // Ignore informational resolver messages (opponent broadcasts, intermediate states)
      if (type.endsWith("Resolve") || type.endsWith("Cancel") ||
          type.endsWith("SelectCard") || type.endsWith("SetOrder") ||
          type.endsWith("Confirm") || type.endsWith("Select") ||
          type.endsWith("Preview") || type.endsWith("Target") ||
          type.endsWith("Response") || type.endsWith("Summary") ||
          type === "motherNatureRevealBegin" || type === "motherNatureRevealResolve" ||
          type === "pigsDeathrite" || type === "pigsDeathResolve" ||
          type === "pithImpSteal" || type === "pithImpReturn" ||
          type === "morganaGenesis" || type === "morganaCast" || type === "morganaRemove" ||
          type === "omphalosRegister" || type === "omphalosDrawn" || type === "omphalosCast" || type === "omphalosRemove" ||
          type === "handPeekAction" || type === "revealCards" || type === "toast" ||
          type === "atlanteanFateReplace" ||
          type === "mephistophelesSummon" ||
          type === "chaosTwisterSliderPosition" || type === "chaosTwisterSelectMinion" ||
          type === "chaosTwisterSelectSite" || type === "chaosTwisterMinigameResult") {
        return true; // Consumed, no action needed
      }

      return false; // Not a resolver message
    } catch (e) {
      try { console.warn("[Bot Resolver] Error handling message:", type, e?.message || e); } catch {}
      return true; // Consume to prevent crash propagation
    }
  }

  /**
   * Helper: get bot's seat key
   */
  _getMeKey() {
    return this.playerIndex === 1 ? "p2" : "p1";
  }

  /**
   * Helper: check if this bot is the caster for a resolver message
   */
  _isMyCast(payload) {
    return payload && payload.casterSeat === this._getMeKey();
  }

  // ─── CASTER-SIDE AUTO-RESOLVE ────────────────────────────────────────

  /**
   * Browse: Look at revealed spells, pick the best one, order rest to bottom.
   */
  _handleBrowseBegin(payload) {
    if (!this._isMyCast(payload)) return; // Opponent's spell — just wait
    const revealed = payload.revealedCards || [];
    const id = payload.id;
    if (!revealed.length || !id) {
      this.socket.emit("message", { type: "browseCancel", id, ts: Date.now() });
      return;
    }
    // Pick card with best score: prioritize ATK, then low cost
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < revealed.length; i++) {
      const c = revealed[i] || {};
      const score = (Number(c.attack || c.atk) || 0) * 2 + (10 - (Number(c.cost) || 0));
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "browseSelectCard", id, cardIndex: bestIdx, ts: Date.now() });
        const bottomOrder = [];
        for (let i = 0; i < revealed.length; i++) { if (i !== bestIdx) bottomOrder.push(i); }
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "browseSetOrder", id, order: bottomOrder, ts: Date.now() });
            setTimeout(() => {
              try {
                this.socket.emit("message", { type: "browseResolve", id, selectedCardIndex: bestIdx, bottomOrder, ts: Date.now() });
                console.log(`[Bot Resolver] Browse: picked card index ${bestIdx}`);
              } catch {}
            }, 300);
          } catch {}
        }, 300);
      } catch {}
    }, 500);
  }

  /**
   * Common Sense: Search for an Ordinary minion, pick the best one.
   */
  _handleCommonSenseBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const eligible = payload.eligibleCards || payload.revealedCards || [];
    const id = payload.id;
    if (!eligible.length || !id) {
      this.socket.emit("message", { type: "commonSenseCancel", id, ts: Date.now() });
      return;
    }
    // Pick highest ATK card
    let bestIdx = 0;
    let bestAtk = -1;
    for (let i = 0; i < eligible.length; i++) {
      const atk = Number(eligible[i]?.attack || eligible[i]?.atk || 0);
      if (atk > bestAtk) { bestAtk = atk; bestIdx = i; }
    }
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "commonSenseSelectCard", id, cardIndex: bestIdx, ts: Date.now() });
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "commonSenseResolve", id, selectedCardIndex: bestIdx, ts: Date.now() });
            console.log(`[Bot Resolver] CommonSense: picked index ${bestIdx}`);
          } catch {}
        }, 300);
      } catch {}
    }, 500);
  }

  /**
   * Call to War: Search for a minion, pick the best one.
   */
  _handleCallToWarBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const eligible = payload.eligibleCards || payload.revealedCards || [];
    const id = payload.id;
    if (!eligible.length || !id) {
      this.socket.emit("message", { type: "callToWarCancel", id, ts: Date.now() });
      return;
    }
    let bestIdx = 0;
    let bestAtk = -1;
    for (let i = 0; i < eligible.length; i++) {
      const atk = Number(eligible[i]?.attack || eligible[i]?.atk || 0);
      if (atk > bestAtk) { bestAtk = atk; bestIdx = i; }
    }
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "callToWarSelectCard", id, cardIndex: bestIdx, ts: Date.now() });
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "callToWarResolve", id, selectedCardIndex: bestIdx, ts: Date.now() });
            console.log(`[Bot Resolver] CallToWar: picked index ${bestIdx}`);
          } catch {}
        }, 300);
      } catch {}
    }, 500);
  }

  /**
   * Searing Truth: Target opponent (always the only valid target).
   */
  _handleSearingTruthBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    const meKey = this._getMeKey();
    const oppKey = meKey === "p1" ? "p2" : "p1";
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "searingTruthTarget", id, targetSeat: oppKey, ts: Date.now() });
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "searingTruthResolve", id, ts: Date.now() });
            console.log(`[Bot Resolver] SearingTruth: targeted ${oppKey}`);
          } catch {}
        }, 800);
      } catch {}
    }, 500);
  }

  /**
   * Accusation: As caster, pick a card from opponent's revealed hand.
   * As victim, hand is auto-revealed — no action needed.
   */
  _handleAccusationBegin(payload) {
    const meKey = this._getMeKey();
    const id = payload.id;
    if (payload.casterSeat === meKey) {
      // We're the caster — pick a card to banish
      const evilIndices = payload.evilCardIndices || [];
      if (evilIndices.length > 0) {
        // Pick the first evil card (any is valid)
        const pick = evilIndices[0];
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "accusationSelectCard", id, cardIndex: pick, ts: Date.now() });
            setTimeout(() => {
              try {
                this.socket.emit("message", { type: "accusationResolve", id, selectedCardIndex: pick, ts: Date.now() });
                console.log(`[Bot Resolver] Accusation: selected card index ${pick}`);
              } catch {}
            }, 300);
          } catch {}
        }, 500);
      } else {
        // No valid targets — just resolve
        setTimeout(() => {
          try { this.socket.emit("message", { type: "accusationResolve", id, ts: Date.now() }); } catch {}
        }, 500);
      }
    }
    // As victim: nothing to do — hand is auto-revealed
  }

  /**
   * Earthquake: Select area with most enemy minions.
   */
  _handleEarthquakeBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    const validAreas = payload.validAreas || [];
    if (!validAreas.length) {
      // Just resolve with no area selection
      setTimeout(() => {
        try { this.socket.emit("message", { type: "earthquakeResolve", id, ts: Date.now() }); } catch {}
      }, 500);
      return;
    }
    // Pick first valid area (simple strategy)
    const area = validAreas[0];
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "earthquakeSelectArea", id, area, ts: Date.now() });
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "earthquakeResolve", id, selectedArea: area, ts: Date.now() });
            console.log(`[Bot Resolver] Earthquake: selected area`);
          } catch {}
        }, 300);
      } catch {}
    }, 500);
  }

  /**
   * Atlantean Fate: Select corner for 2x2 flooding area.
   */
  _handleAtlanteanFateBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    const validCorners = payload.validCorners || payload.validTargets || [];
    if (!validCorners.length) {
      setTimeout(() => {
        try { this.socket.emit("message", { type: "atlanteanFateCancel", id, ts: Date.now() }); } catch {}
      }, 500);
      return;
    }
    const corner = validCorners[0];
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "atlanteanFateSelect", id, corner, ts: Date.now() });
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "atlanteanFateResolve", id, selectedCorner: corner, ts: Date.now() });
            console.log(`[Bot Resolver] AtlanteanFate: selected corner`);
          } catch {}
        }, 300);
      } catch {}
    }, 500);
  }

  /**
   * Chaos Twister: Bot can't play dexterity minigame — cancel.
   */
  _handleChaosTwisterBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "chaosTwisterCancel", id, ts: Date.now() });
        console.log(`[Bot Resolver] ChaosTwister: cancelled (bot cannot play minigame)`);
      } catch {}
    }, 500);
  }

  /**
   * Black Mass: Sacrifice minions — bot skips sacrifice (too complex).
   */
  _handleBlackMassBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "blackMassResolve", id, sacrificedUnits: [], ts: Date.now() });
        console.log(`[Bot Resolver] BlackMass: resolved with no sacrifices`);
      } catch {}
    }, 500);
  }

  /**
   * Raise Dead: Pick a card from graveyard to return.
   */
  _handleRaiseDeadBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const eligible = payload.eligibleCards || [];
    const id = payload.id;
    if (!eligible.length) {
      setTimeout(() => {
        try { this.socket.emit("message", { type: "raiseDeadCancel", id, ts: Date.now() }); } catch {}
      }, 500);
      return;
    }
    // Pick the highest ATK creature from graveyard
    let bestIdx = 0;
    let bestAtk = -1;
    for (let i = 0; i < eligible.length; i++) {
      const atk = Number(eligible[i]?.attack || eligible[i]?.atk || 0);
      if (atk > bestAtk) { bestAtk = atk; bestIdx = i; }
    }
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "raiseDeadResolve", id, selectedCardIndex: bestIdx, ts: Date.now() });
        console.log(`[Bot Resolver] RaiseDead: picked index ${bestIdx}`);
      } catch {}
    }, 500);
  }

  /**
   * Legion of Gall: Banish cards from opponent's collection.
   */
  _handleLegionOfGallBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    // Auto-confirm and resolve (complex selection — just confirm default)
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "legionOfGallConfirm", id, ts: Date.now() });
        setTimeout(() => {
          try {
            this.socket.emit("message", { type: "legionOfGallResolve", id, ts: Date.now() });
            console.log(`[Bot Resolver] LegionOfGall: resolved`);
          } catch {}
        }, 300);
      } catch {}
    }, 500);
  }

  /**
   * Highland Princess: Genesis token summon — auto-confirm.
   */
  _handleHighlandPrincessBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "highlandPrincessResolve", id, ts: Date.now() });
        console.log(`[Bot Resolver] HighlandPrincess: resolved`);
      } catch {}
    }, 500);
  }

  /**
   * Pathfinder: Select target cell for site placement.
   */
  _handlePathfinderBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    const validTargets = payload.validTargets || [];
    if (!validTargets.length) {
      setTimeout(() => {
        try { this.socket.emit("message", { type: "pathfinderCancel", id, ts: Date.now() }); } catch {}
      }, 500);
      return;
    }
    const target = validTargets[0];
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "pathfinderResolve", id, targetCell: target, ts: Date.now() });
        console.log(`[Bot Resolver] Pathfinder: placed at ${JSON.stringify(target)}`);
      } catch {}
    }, 500);
  }

  /**
   * Babel Tower: Select cell for apex placement.
   */
  _handleBabelPlacementBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    const validTargets = payload.validTargets || [];
    if (!validTargets.length) {
      setTimeout(() => {
        try { this.socket.emit("message", { type: "babelPlacementCancel", id, ts: Date.now() }); } catch {}
      }, 500);
      return;
    }
    const target = validTargets[0];
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "babelPlacementResolve", id, targetCell: target, ts: Date.now() });
        console.log(`[Bot Resolver] BabelPlacement: placed at ${JSON.stringify(target)}`);
      } catch {}
    }, 500);
  }

  /**
   * Mephistopheles: Accept avatar upgrade (always beneficial).
   */
  _handleMephistophelesBegin(payload) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "mephistophelesResolve", id, becomeAvatar: true, ts: Date.now() });
        console.log(`[Bot Resolver] Mephistopheles: accepted avatar upgrade`);
      } catch {}
    }, 500);
  }

  /**
   * Generic resolver cancel — for resolvers the bot doesn't understand.
   */
  _handleGenericResolverCancel(payload, resolverName) {
    if (!this._isMyCast(payload)) return;
    const id = payload.id;
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: `${resolverName}Cancel`, id, ts: Date.now() });
        console.log(`[Bot Resolver] ${resolverName}: cancelled (unsupported)`);
      } catch {}
    }, 500);
  }

  // ─── OPPONENT-SIDE RESPONSE ──────────────────────────────────────────

  /**
   * Interrogator: Victim chooses to pay 3 life or allow opponent draw.
   */
  _handleInterrogatorTrigger(payload) {
    const meKey = this._getMeKey();
    if (payload.victimSeat !== meKey) return; // Not targeting us
    const id = payload.id;
    const myLife = (this._combatLife && this._combatLife[meKey]) || 20;
    // Strategy: pay if healthy (>10 life), otherwise allow draw
    const shouldPay = myLife > 10;
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "interrogatorResolve", id, victimPays: shouldPay, ts: Date.now() });
        console.log(`[Bot Resolver] Interrogator: ${shouldPay ? "paid 3 life" : "allowed draw"} (life=${myLife})`);
      } catch {}
    }, 500);
  }

  /**
   * Lilith Reveal: Opponent reveals top spellbook card (required, automatic).
   */
  _handleLilithRevealRequest(payload) {
    const meKey = this._getMeKey();
    if (payload.targetSeat !== meKey && payload.victimSeat !== meKey) return;
    const id = payload.id;
    // Get top card from our spellbook
    const zones = this._game && this._game.zones;
    const myZones = zones && zones[meKey];
    const spellbook = (myZones && myZones.spellbook) || [];
    const topCard = spellbook.length > 0 ? spellbook[0] : null;
    setTimeout(() => {
      try {
        this.socket.emit("message", {
          type: "lilithRevealResponse",
          id,
          card: topCard,
          isMinion: topCard && (topCard.type || "").toLowerCase().includes("minion"),
          isEmpty: spellbook.length === 0,
          ts: Date.now(),
        });
        console.log(`[Bot Resolver] Lilith: revealed top card${topCard ? ` (${topCard.name})` : " (empty)"}`);
      } catch {}
    }, 500);
  }

  /**
   * Headless Haunt: Auto-move haunts to valid adjacent tiles.
   */
  _handleHeadlessHauntBegin(payload) {
    const meKey = this._getMeKey();
    // Only owner handles haunt movement
    if (payload.ownerSeat !== meKey && payload.casterSeat !== meKey) return;
    const id = payload.id;
    const haunts = payload.haunts || [];
    if (!haunts.length) {
      setTimeout(() => {
        try { this.socket.emit("message", { type: "headlessHauntResolve", id, ts: Date.now() }); } catch {}
      }, 300);
      return;
    }
    // For each haunt with valid targets, pick first valid target
    let idx = 0;
    const processNext = () => {
      if (idx >= haunts.length) {
        try { this.socket.emit("message", { type: "headlessHauntResolve", id, ts: Date.now() }); } catch {}
        return;
      }
      const haunt = haunts[idx];
      const targets = haunt.validTargets || [];
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        try {
          this.socket.emit("message", {
            type: "headlessHauntPartialResolve",
            id,
            hauntIndex: idx,
            targetCell: target,
            ts: Date.now(),
          });
        } catch {}
      } else {
        try {
          this.socket.emit("message", { type: "headlessHauntSkip", id, hauntIndex: idx, ts: Date.now() });
        } catch {}
      }
      idx++;
      setTimeout(processNext, 300);
    };
    setTimeout(processNext, 500);
  }

  /**
   * Auto-resolve: Confirm automatic resolver actions (ETB effects, etc.)
   */
  _handleAutoResolveBegin(payload) {
    const meKey = this._getMeKey();
    if (payload.ownerSeat !== meKey && payload.casterSeat !== meKey) return;
    const id = payload.id;
    setTimeout(() => {
      try {
        this.socket.emit("message", { type: "autoResolveConfirm", id, ts: Date.now() });
        console.log(`[Bot Resolver] AutoResolve: confirmed (kind=${payload.kind || "unknown"})`);
      } catch {}
    }, 500);
  }

  /**
   * Extract combat-relevant keywords from a card.
   */
  _getCardKeywords(card) {
    const COMBAT_KEYWORDS = [
      "stealth", "airborne", "lethal", "ward", "initiative", "ranged",
      "burrow", "voidwalk", "guardian", "defender", "reach", "lifesteal",
      "genesis", "charge", "disable", "submerge",
      "immobile", "sideways",
    ];
    const kw = new Set();
    if (!card) return kw;
    const keywords = card.keywords || [];
    if (Array.isArray(keywords)) {
      for (const k of keywords) {
        const s = String(k).toLowerCase();
        for (const word of COMBAT_KEYWORDS) {
          if (s.includes(word)) kw.add(word);
        }
      }
    }
    const text = String(card.rulesText || card.text || "").toLowerCase();
    for (const word of COMBAT_KEYWORDS) {
      if (text.includes(word)) kw.add(word);
    }
    return kw;
  }

  /**
   * Evaluate potential defenders and pick the best one (or none).
   * Returns { cellKey, index, instanceId } or null if we shouldn't block.
   */
  _findBestDefender(payload) {
    try {
      const meKey = this._getMeKey();
      const myNum = meKey === "p1" ? 1 : 2;

      // Get attacker info
      const attackerCard = payload.attacker && payload.attacker.card;
      if (!attackerCard) return null;
      const atkKw = this._getCardKeywords(attackerCard);
      const atkAtk = Number(attackerCard.attack || 0);
      const atkDef = Number(attackerCard.defence || attackerCard.defense || 0);

      // Find the target cell (where the attack lands)
      const targetCell = payload.target;
      if (!targetCell) return null;

      // Find our untapped units at the target cell
      const perms = this._game && this._game.permanents;
      if (!perms || !perms[targetCell]) return null;
      const cellPerms = perms[targetCell];
      if (!Array.isArray(cellPerms)) return null;

      // Get our life to check for lethal prevention
      const avatars = this._game && this._game.avatars;
      const myAvatar = avatars && avatars[meKey];
      const myLife = Number(myAvatar && myAvatar.life) || 20;

      // Check if target is our avatar (blocking is more valuable)
      const isAvatarTarget = payload.targetType === "avatar" ||
        (myAvatar && myAvatar.pos === targetCell);

      let bestDefender = null;
      let bestScore = 0;

      for (let i = 0; i < cellPerms.length; i++) {
        const perm = cellPerms[i];
        if (!perm || Number(perm.owner) !== myNum) continue;
        if (perm.tapped) continue; // Can't block if tapped
        const card = perm.card;
        if (!card) continue;
        const cardType = String(card.type || "").toLowerCase();
        if (cardType.includes("site")) continue; // Sites can't block

        const defKw = this._getCardKeywords(card);
        const defAtk = Number(card.attack || 0);
        const defDef = Number(card.defence || card.defense || 0);
        const defCost = Number(card.cost || card.manaCost || 0);
        const atkCost = Number(attackerCard.cost || attackerCard.manaCost || 0);

        const weKillAttacker = defAtk >= atkDef || defKw.has("lethal");
        const theyKillUs = atkAtk >= defDef || atkKw.has("lethal");
        const theyHitFirst = atkKw.has("initiative") && !defKw.has("initiative");

        let score = 0;

        // Score based on trade outcome
        if (weKillAttacker && !theyKillUs) {
          // Great trade — we kill them, survive
          score += 20;
        } else if (weKillAttacker && theyKillUs) {
          // Even trade — both die
          score += (atkCost >= defCost) ? 5 : -3;
        } else if (!weKillAttacker && theyKillUs) {
          // Bad trade — we die, they survive
          score -= 10;
        } else {
          // Bounce — neither dies, but we prevent damage
          score += 2;
        }

        // Initiative disadvantage — they kill us before we strike
        if (theyHitFirst && theyKillUs) {
          score -= 8;
        }

        // Blocking avatar attacks is more valuable
        if (isAvatarTarget) {
          score += 5;
          // Preventing lethal to avatar is critical
          if (myLife <= atkAtk && myLife <= 5) {
            score += 30;
          }
        }

        // Don't block with high-value units into lethal attackers
        if (atkKw.has("lethal") && !weKillAttacker) {
          score -= 15;
        }

        if (score > bestScore) {
          bestScore = score;
          bestDefender = {
            cellKey: targetCell,
            index: i,
            instanceId: perm.instanceId || null,
          };
        }
      }

      if (bestDefender) {
        console.log(`[Bot Combat] Best defender found with score ${bestScore}`);
      }
      return bestDefender;
    } catch (e) {
      console.error("[Bot Combat] Error finding defender:", e);
      return null;
    }
  }

  /**
   * Handle incoming combat messages from the server.
   */
  _handleCombatMessage(type, payload) {
    const meKey = this.playerIndex === 1 ? "p2" : "p1";
    const myNum = meKey === "p1" ? 1 : 2;

    switch (type) {
      case "attackDeclare": {
        // If we're the defender, auto-commit defenders (empty = unblocked)
        const attackerOwner = Number(payload.attacker && payload.attacker.owner);
        if (attackerOwner === myNum) {
          // We're the attacker — wait for combatCommit
          const existing = this._pendingCombats.get(payload.id);
          if (existing) existing.status = "declared";
          return;
        }
        // We're the defender — evaluate whether to block
        this._pendingCombats.set(payload.id, {
          combatId: payload.id,
          myKey: meKey,
          myNum,
          role: "defender",
          status: "declared",
          attackerData: payload,
        });
        setTimeout(() => {
          try {
            const p = this._pendingCombats.get(payload.id);
            if (!p || p.status === "committed") return;
            p.status = "committed";
            const bestDefender = this._findBestDefender(payload);
            const defenders = bestDefender ? [bestDefender] : [];
            console.log(`[Bot Combat] Defending: ${defenders.length ? "blocking" : "not blocking"} for ${payload.id}`);
            this.socket.emit("message", {
              type: "combatCommit",
              id: payload.id,
              defenders,
              target: payload.target,
              playerKey: meKey,
              ts: Date.now(),
            });
          } catch {}
        }, 800);
        break;
      }

      case "combatCommit": {
        // If we're the attacker, resolve combat after a short delay
        const pending = this._pendingCombats.get(payload.id);
        if (!pending || pending.role !== "attacker") return;
        pending.status = "committed";
        console.log(`[Bot Combat] Resolving combat ${payload.id} (after delay)`);
        setTimeout(() => {
          try {
            this._resolveCombat(pending, payload.defenders || []);
          } catch {}
        }, 600);
        break;
      }

      case "combatAutoApply": {
        // Apply kills to our own permanents
        const kills = payload.kills;
        if (!Array.isArray(kills) || !this._game) return;
        for (const kill of kills) {
          try {
            const ownerSeat = kill.owner === 1 ? "p1" : kill.owner === 2 ? "p2" : kill.owner;
            if (ownerSeat !== meKey) continue; // Only apply kills to our own units
            const perms = this._game.permanents;
            if (!perms || !perms[kill.at]) continue;
            const arr = perms[kill.at];
            if (!Array.isArray(arr)) continue;
            // Find by instanceId if available, else by index
            let idx = kill.index;
            if (kill.instanceId) {
              const found = arr.findIndex(p => p && p.instanceId === kill.instanceId);
              if (found >= 0) idx = found;
            }
            if (idx >= 0 && idx < arr.length) {
              const removed = arr.splice(idx, 1)[0];
              // Move to graveyard
              if (removed) {
                const zones = (this._game.zones && this._game.zones[ownerSeat]) || {};
                if (!zones.graveyard) zones.graveyard = [];
                zones.graveyard.push(removed.card || removed);
                console.log(`[Bot Combat] Killed unit at ${kill.at}[${idx}]: ${removed.card?.name || "?"}`);
              }
            }
          } catch {}
        }
        this._pendingCombats.delete(payload.id);
        break;
      }

      case "combatLifeDamage": {
        // Apply life damage using combat-specific tracking
        const damages = payload.damage;
        if (!Array.isArray(damages)) return;
        for (const dmg of damages) {
          try {
            const seat = dmg.seat;
            if (!seat) continue;
            const amount = Number(dmg.amount) || 0;
            if (amount <= 0) continue;
            const prevLife = this._combatLife[seat] || 20;
            this._combatLife[seat] = prevLife - amount;
            console.log(`[Bot Combat] ${seat} took ${amount} life damage: ${prevLife} -> ${this._combatLife[seat]}`);
            // Check for game over
            if (this._combatLife[seat] <= 0) {
              const winner = seat === "p1" ? "p2" : "p1";
              console.log(`[Bot Combat] GAME OVER! ${seat} life reached ${this._combatLife[seat]}. Winner: ${winner}`);
              this._gameEnded = true;
              this._gameWinner = winner;
            }
          } catch {}
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Resolve combat as attacker: calculate ATK vs DEF, send kill/damage messages.
   */
  _resolveCombat(pending, defenders) {
    try {
      const meKey = pending.myKey;
      const myNum = pending.myNum;
      const oppSeat = meKey === "p1" ? "p2" : "p1";
      const oppNum = myNum === 1 ? 2 : 1;

      // Get attacker stats
      const perms = (this._game && this._game.permanents) || {};
      const isAvatarAttack = pending.isAvatarAttack || pending.attackerIndex === -1;
      let attackerUnit = null;
      let attackerStats = { atk: 0, def: 0 };

      if (isAvatarAttack) {
        // Avatar attacker — stats come from avatar card
        const myAvatar = (this._game && this._game.avatars && this._game.avatars[meKey]) || {};
        const avatarCard = myAvatar.card || pending.attackerCard || { name: "Avatar", attack: 1 };
        attackerUnit = { card: avatarCard, owner: myNum, _isAvatar: true };
        attackerStats = { atk: Number(avatarCard.attack || 1), def: 0 }; // Avatar has no DEF — damage goes to life
        console.log(`[Bot Combat] Avatar attacker: ATK=${attackerStats.atk}`);
      } else {
        const attackerArr = Array.isArray(perms[pending.toKey]) ? perms[pending.toKey] : [];
        attackerUnit = attackerArr[pending.attackerIndex];
        // If not found at expected index, search for our unit at that cell
        if (!attackerUnit || Number(attackerUnit.owner) !== myNum) {
          const found = attackerArr.findIndex(p => p && Number(p.owner) === myNum);
          if (found >= 0) {
            attackerUnit = attackerArr[found];
            pending.attackerIndex = found;
          }
        }
        if (!attackerUnit) {
          console.log("[Bot Combat] Attacker not found at " + pending.toKey);
          this._pendingCombats.delete(pending.combatId);
          return;
        }
        attackerStats = this._getCardCombatStats(attackerUnit.card);
      }
      const attackerAtk = attackerStats.atk;
      const attackerDef = attackerStats.def;

      const killList = [];
      let attackerAlive = true;

      if (pending.target && pending.target.kind === "permanent") {
        // Attacking a unit
        const targetArr = perms[pending.target.at] || [];
        const targetUnit = targetArr[pending.target.index];
        if (targetUnit) {
          const targetStats = this._getCardCombatStats(targetUnit.card);
          const targetAtk = targetStats.atk;
          const targetDef = targetStats.def;

          console.log(`[Bot Combat] ${attackerUnit.card?.name || "?"} (${attackerAtk}/${attackerDef}) vs ${targetUnit.card?.name || "?"} (${targetAtk}/${targetDef})`);

          // Attacker kills defender?
          if (attackerAtk >= targetDef && targetDef > 0) {
            const targetOwnerSeat = Number(targetUnit.owner) === 1 ? "p1" : "p2";
            killList.push({
              at: pending.target.at,
              index: pending.target.index,
              owner: targetOwnerSeat,
              instanceId: targetUnit.instanceId || null,
            });
          }
          // Defender counter-damages attacker?
          if (isAvatarAttack) {
            // Avatar attacker: counter-damage goes to our own life
            const counterDmg = Math.max(0, targetAtk);
            if (counterDmg > 0) {
              console.log(`[Bot Combat] Avatar takes ${counterDmg} counter-damage to ${meKey} life`);
              this.socket.emit("message", {
                type: "combatLifeDamage",
                id: pending.combatId,
                damage: [{ seat: meKey, amount: counterDmg, isAvatarDamage: true }],
                ts: Date.now(),
              });
              const prevLife = this._combatLife[meKey] || 20;
              this._combatLife[meKey] = prevLife - counterDmg;
              console.log(`[Bot Combat] ${meKey} took ${counterDmg} counter-damage: ${prevLife} -> ${this._combatLife[meKey]}`);
            }
          } else if (targetAtk >= attackerDef && attackerDef > 0) {
            attackerAlive = false;
            killList.push({
              at: pending.toKey,
              index: pending.attackerIndex,
              owner: meKey,
              instanceId: attackerUnit.instanceId || null,
            });
          }
        }
      } else if (pending.target && (pending.target.kind === "site" || pending.target.kind === "avatar")) {
        // Attacking a site or avatar — deal life damage
        const dmgAmount = Math.max(0, attackerAtk);
        if (dmgAmount > 0) {
          const isAvatar = pending.target.kind === "avatar";
          console.log(`[Bot Combat] Attacking ${pending.target.kind}: ${dmgAmount} damage to ${oppSeat}`);
          this.socket.emit("message", {
            type: "combatLifeDamage",
            id: pending.combatId,
            damage: [{ seat: oppSeat, amount: dmgAmount, isAvatarDamage: isAvatar }],
            ts: Date.now(),
          });
          // Apply to combat life tracking (not game state, which gets overwritten)
          const prevLife = this._combatLife[oppSeat] || 20;
          this._combatLife[oppSeat] = prevLife - dmgAmount;
          console.log(`[Bot Combat] Dealt ${dmgAmount} to ${oppSeat}: ${prevLife} -> ${this._combatLife[oppSeat]}`);
          if (this._combatLife[oppSeat] <= 0) {
            console.log(`[Bot Combat] GAME OVER! ${oppSeat} life reached ${this._combatLife[oppSeat]}. Winner: ${meKey}`);
          }
        }
      }

      // Send kill messages
      if (killList.length > 0) {
        console.log(`[Bot Combat] Sending ${killList.length} kills`);
        this.socket.emit("message", {
          type: "combatAutoApply",
          id: pending.combatId,
          kills: killList,
          playerKey: meKey,
          ts: Date.now(),
        });
        // Apply our own kills locally (kills where we're the owner)
        for (const kill of killList) {
          try {
            if (kill.owner !== meKey) continue;
            const arr = perms[kill.at];
            if (!Array.isArray(arr)) continue;
            let idx = kill.index;
            if (kill.instanceId) {
              const found = arr.findIndex(p => p && p.instanceId === kill.instanceId);
              if (found >= 0) idx = found;
            }
            if (idx >= 0 && idx < arr.length) {
              const removed = arr.splice(idx, 1)[0];
              if (removed) {
                const zones = (this._game.zones && this._game.zones[meKey]) || {};
                if (!zones.graveyard) zones.graveyard = [];
                zones.graveyard.push(removed.card || removed);
              }
            }
          } catch {}
        }
        // Apply opponent's kills locally too (since server only relays, we need to update our view)
        for (const kill of killList) {
          try {
            if (kill.owner === meKey) continue; // Already handled above
            const arr = perms[kill.at];
            if (!Array.isArray(arr)) continue;
            let idx = kill.index;
            if (kill.instanceId) {
              const found = arr.findIndex(p => p && p.instanceId === kill.instanceId);
              if (found >= 0) idx = found;
            }
            if (idx >= 0 && idx < arr.length) {
              arr.splice(idx, 1);
            }
          } catch {}
        }
      }

      // Send combat summary so the human client displays the result
      try {
        const attackerName = attackerUnit?.card?.name || "Unit";
        const targetKind = pending.target?.kind || "target";
        let summaryText = "";
        if (killList.length > 0 && !attackerAlive) {
          summaryText = `${attackerName} and defender traded!`;
        } else if (killList.length > 0) {
          summaryText = `${attackerName} destroyed the ${targetKind}!`;
        } else if (!attackerAlive) {
          summaryText = `${attackerName} was destroyed!`;
        } else if (pending.target?.kind === "avatar" || pending.target?.kind === "site") {
          summaryText = `${attackerName} dealt ${attackerAtk} damage!`;
        } else {
          summaryText = `${attackerName} attacked!`;
        }
        this.socket.emit("message", {
          type: "combatSummary",
          id: pending.combatId,
          text: summaryText,
          actor: meKey,
          targetSeat: oppSeat,
          ts: Date.now(),
        });
      } catch {}

      this._pendingCombats.delete(pending.combatId);
    } catch (e) {
      try { console.warn("[Bot Combat] resolve error:", e.message || e); } catch {}
    }
  }

  _maybeAct() {
    try {
      const match = this.currentMatch;
      if (!match || !this._game) return;
      // Do not act during setup. Wait until server has transitioned to in_progress
      if (match.status !== "in_progress") return;
      // Check if game is over (combat life reached 0)
      if (this._combatLife.p1 <= 0 || this._combatLife.p2 <= 0) return;
      const myNum = this.playerIndex === 1 ? 2 : 1;
      const meKey = this.playerIndex === 1 ? "p2" : "p1";

      const turnKey = `${match.id}:${this._turnIndex}`;

      // Handle Start phase locally: untap avatar, draw from spellbook, transition to Main
      // Done entirely locally — the server doesn't enforce phase transitions
      // Only process once per turn (server may re-send phase: "Start" in later patches)
      if (this._game.phase === "Start" && this._game.currentPlayer === myNum) {
        if (!this._startPhaseHandled.has(turnKey)) {
          this._startPhaseHandled.add(turnKey);
          console.log(`[Bot] Start phase: untapping avatar, resetting resources, drawing, transitioning to Main`);
          // Untap our avatar locally
          if (!this._game.avatars) this._game.avatars = {};
          const avPrev = this._game.avatars[meKey] || {};
          this._game.avatars[meKey] = { ...avPrev, tapped: false };
          // Reset mana spent for new turn
          if (!this._game.resources) this._game.resources = {};
          this._game.resources[meKey] = { spentThisTurn: 0 };
          // Clear summoning sickness on all our units
          const perms = this._game.permanents || {};
          for (const cellKey of Object.keys(perms)) {
            const arr = perms[cellKey];
            if (!Array.isArray(arr)) continue;
            for (const p of arr) {
              if (p && Number(p.owner) === myNum && p.summonedThisTurn) {
                p.summonedThisTurn = false;
              }
            }
          }
          // Clear summoning sickness tracking for the new turn
          this._clearSummoningSickness();
          // Draw one card from spellbook (unless first turn for first player)
          const isVeryFirstTurn = this._turnIndex <= 1 && this._startedAsFirst;
          if (!isVeryFirstTurn) {
            const zones = (this._game.zones && this._game.zones[meKey]) || {};
            const spellbook = Array.isArray(zones.spellbook) ? [...zones.spellbook] : [];
            if (spellbook.length > 0) {
              const drawn = spellbook.shift();
              const hand = Array.isArray(zones.hand) ? [...zones.hand, drawn] : [drawn];
              if (!this._game.zones) this._game.zones = {};
              this._game.zones[meKey] = { ...zones, spellbook, hand };
            }
          }
        }
        // Always force Main phase when it's our turn
        this._game.phase = "Main";
      }

      if (this._game.phase !== "Main") return;
      if (this._game.currentPlayer !== myNum) return;
      if (this._actedTurn.has(turnKey)) return; // Already passed this turn

      // Don't re-enter while waiting for server to process our last action
      if (this._pendingAction) return;

      // Safety: max 10 actions per turn to prevent infinite loops
      const actionCount = this._turnActionCount.get(turnKey) || 0;
      if (actionCount >= 10) {
        console.log(`[Bot] Max actions (10) reached for turn ${turnKey}, forcing pass`);
        const other = myNum === 1 ? 2 : 1;
        this.socket.emit("action", { action: { currentPlayer: other, phase: "Start" } });
        this._actedTurn.add(turnKey);
        return;
      }

      // DEBUG: Log game state before acting
      try {
        const zones = (this._game.zones && this._game.zones[meKey]) || null;
        const handSize = zones && zones.hand ? zones.hand.length : 0;
        const sites = (this._game.board && this._game.board.sites) || {};
        const ownedSites = Object.values(sites).filter(
          (s) => s && s.card && Number(s.owner) === myNum
        ).length;
        const siteKeys = Object.keys(sites).filter(k => sites[k] && sites[k].card);
        const permKeys = Object.keys(this._game.permanents || {}).filter(k => {
          const arr = this._game.permanents[k];
          return Array.isArray(arr) && arr.some(p => p && Number(p.owner) === myNum);
        });
        console.log(
          `[Bot] Turn ${this._turnIndex}: hand=${handSize}, ownedSites=${ownedSites}, siteKeys=[${siteKeys.join(',')}], myUnits@=[${permKeys.join(',')}], turnKey=${turnKey}`
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

      // Ensure avatar is placed on board before doing anything else
      // Both engine and legacy paths need the avatar to have a valid position
      const myAvatar = avatars[meKey] || {};
      if (!myAvatar.pos || !Array.isArray(myAvatar.pos)) {
        const bw = (board.size && board.size.w) || 5;
        const bh = (board.size && board.size.h) || 5;
        const cx = Math.floor(Math.max(1, Number(bw) || 5) / 2);
        const yy = meKey === "p1" ? (Number(bh) || 5) - 1 : 0;
        const avatarCard = myAvatar.card || this._chooseAvatarCardRef();
        const avatarPatch = {
          avatars: {
            [meKey]: {
              card: avatarCard,
              pos: [cx, yy],
              offset: null,
              tapped: false,
            },
          },
        };
        try {
          console.log(`[Bot] Placing avatar on board at [${cx}, ${yy}] for ${meKey} (first action of turn)`);
        } catch {}
        // Send to server and apply locally
        try {
          const hydrated = this._hydratePatchCardRefs(avatarPatch);
          this.socket.emit("action", { action: hydrated });
          this._mergeGamePatch(avatarPatch);
        } catch {}
        // Don't count this as a game action, just continue
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
        // Inject turnIndex into game state so the engine can use phase-based strategy
        // The engine reads state.turnIndex for deterministic actions (turns 1-3: play site)
        // and strategic modifiers (Phase 1: prioritize sites over movement)
        this._game.turnIndex = this._turnIndex;
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
            // Diagnostic logging: what did the engine decide?
            try {
              // Distinguish attack (permanents only, no zones) from unit placement (permanents + zones)
              const isAttack = patch.permanents && !patch.zones && !patch.board;
              const decisionType = isAttack ? 'ATTACK' :
                patch.permanents ? 'UNIT/PERM' :
                (patch.board && patch.board.sites) ? 'SITE' :
                patch._spellCast ? 'SPELL' :
                patch.zones ? 'DRAW' : 'PASS/OTHER';
              const siteCount = Object.keys((this._game && this._game.board && this._game.board.sites) || {}).length;
              const handSize = ((this._game && this._game.zones && this._game.zones[meKey] && this._game.zones[meKey].hand) || []).length;
              const manaSpent = (this._game && this._game.resources && this._game.resources[meKey] && this._game.resources[meKey].spentThisTurn) || 0;
              console.log(`[Bot] Engine decision: ${decisionType} | turn=${this._turnIndex} action#${actionCount + 1} sites=${siteCount} hand=${handSize} manaSpent=${manaSpent}`);
            } catch {}

            // Detect if engine returned endTurnPatch (pass) vs a game action
            // Also treat empty patches {} as pass (no meaningful action)
            const hasGameData = patch.zones || patch.board || patch.permanents || patch.avatars;
            const isPass = !hasGameData;

            if (isPass) {
              // Engine chose to pass — end the turn
              console.log(`[Bot] Engine chose PASS after ${actionCount} actions this turn`);
              const other = myNum === 1 ? 2 : 1;
              const endTurnAction = typeof patch.currentPlayer === "number"
                ? patch  // Engine returned proper endTurnPatch
                : { currentPlayer: other, phase: "Start" };  // Empty patch, construct end-turn
              this.socket.emit("action", { action: endTurnAction });
              this._emitBotToast("Ended turn");
              // Optimistically apply end-turn locally (server won't echo back to us)
              try { this._mergeGamePatch(endTurnAction); } catch {}
              this._actedTurn.add(turnKey);
              // Fallback: if currentPlayer didn't flip after 1.5s, try once more
              setTimeout(() => {
                try {
                  if (!this._game) return;
                  if (this._game.currentPlayer === myNum) {
                    this.socket.emit("action", {
                      action: { currentPlayer: myNum === 1 ? 2 : 1, phase: "Start" },
                    });
                  }
                } catch {}
              }, 1500);
            } else {
              // Engine chose a game action — send it to server
              const toSend = this._hydratePatchCardRefs(patch);
              try {
                console.log(
                  `[Bot] Sending action #${actionCount + 1} (turn ${this._turnIndex}):`,
                  JSON.stringify(toSend, null, 2).substring(0, 500)
                );
              } catch {}
              this.socket.emit("action", { action: toSend });
              this._turnActionCount.set(turnKey, actionCount + 1);
              // Emit toast so the human player can see what the bot did
              const toastMsg = this._describePatch(patch);
              if (toastMsg) this._emitBotToast(toastMsg);
              // Optimistically apply our own action to local state
              // (server broadcasts to other players but NOT back to sender)
              try { this._mergeGamePatch(patch); } catch {}
              // Track summoned units for summoning sickness enforcement
              if (patch.permanents && patch.zones) {
                // Unit placement: has both permanents (unit on board) and zones (removed from hand)
                for (const cellKey of Object.keys(patch.permanents)) {
                  this._trackSummonedUnit(cellKey);
                }
              }
              // Emit magic flow messages when casting a spell (so human client shows the spell UI)
              if (patch._spellCast && patch._spellCard) {
                try {
                  this._emitMagicFlow(patch._spellCard, meKey);
                } catch {}
              }
              // Emit toast message for site placement (matches human client behavior)
              if (patch.board && patch.board.sites) {
                try {
                  for (const cellKey of Object.keys(patch.board.sites)) {
                    const site = patch.board.sites[cellKey];
                    if (site && site.card) {
                      this.socket.emit("message", {
                        type: "toast",
                        text: `Played '${site.card.name || "Site"}'`,
                        cellKey,
                        seat: meKey,
                        ts: Date.now(),
                      });
                    }
                  }
                } catch {}
              }
              // Emit toast message for unit placement
              if (patch.permanents && patch.zones && !patch._attackMeta) {
                try {
                  for (const cellKey of Object.keys(patch.permanents)) {
                    const arr = patch.permanents[cellKey];
                    if (Array.isArray(arr) && arr.length > 0) {
                      const newest = arr[arr.length - 1];
                      if (newest && newest.card) {
                        this.socket.emit("message", {
                          type: "toast",
                          text: `Played '${newest.card.name || "Card"}'`,
                          cellKey,
                          seat: meKey,
                          ts: Date.now(),
                        });
                      }
                    }
                  }
                } catch {}
              }
              // If this was an attack move, trigger combat protocol
              if (patch._attackMeta) {
                try {
                  // Delay to let server process the move and client animate
                  const attackMeta = patch._attackMeta;
                  setTimeout(() => {
                    this._triggerCombat(attackMeta, meKey);
                  }, 600);
                } catch {}
              }
              // Schedule next action attempt after a delay (slow enough for human to follow)
              this._pendingAction = true;
              setTimeout(() => {
                this._pendingAction = false;
                this._maybeAct();
              }, 1000);
            }
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

      // 3) Ensure avatar has a real card slug, position, and tap it
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
      // Ensure avatar has a board position (canonical placement)
      if (!av.pos || !Array.isArray(av.pos)) {
        const cx = Math.floor(Math.max(1, Number(w) || 5) / 2);
        const yy = myNum === 1 ? (Number(h) || 5) - 1 : 0;
        av.pos = [cx, yy];
        av.offset = null;
        try {
          console.log(`[Bot] Legacy path: placing avatar at [${cx}, ${yy}] for ${meKey}`);
        } catch {}
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

      // Legacy path always does one action then passes
      this._actedTurn.add(turnKey);
      setTimeout(() => {
        try {
          const other = myNum === 1 ? 2 : 1;
          this.socket.emit("action", {
            action: { currentPlayer: other, phase: "Start" },
          });
        } catch {}
      }, 500);
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
          // Also check if seer phase needs handling
          this._initiateSeerIfNeeded();
        } catch {}
      }, 5000); // 5s interval — human may take time to pick deck and mulligan
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
          // Enrich with cost, thresholds, and type from cards_raw.json
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
          // Enrich with thresholds from cards_raw.json
          const enriched = this._hydrateCardRef(ref);
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

module.exports = { BotClient, loadCardIdMap };
