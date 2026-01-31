// Pure engine module (no Node I/O). Consumers provide θ and optional telemetry logger.

// T036: Import card evaluation system for card-specific understanding
let cardEvalLoader = null;
let cardEvalCache = null;
let cacheInitialized = false;

try {
  cardEvalLoader = require("../card-evaluations/loader");
  // Note: Cache not loaded at module time - use initCardEvaluations() for async DB loading
  // or cache will be lazy-loaded from JSON on first use
} catch (e) {
  console.warn("[Engine] Card evaluation system not available:", e.message);
}

/**
 * Initialize card evaluation cache (async)
 * Tries database first, falls back to JSON if database fails
 * @returns {Promise<object>} Stats about loaded evaluations
 */
async function initCardEvaluations() {
  if (cacheInitialized) {
    return {
      loaded: cardEvalCache ? cardEvalCache.getStats().loaded : 0,
      source: "already_initialized",
    };
  }

  if (!cardEvalLoader) {
    console.warn("[Engine] Card evaluation system not available");
    return { loaded: 0, source: "unavailable" };
  }

  try {
    // Try database first
    console.log("[Engine] Loading card evaluations from database...");
    cardEvalCache = await cardEvalLoader.initCacheFromDatabase();
    const stats = cardEvalCache.getStats();
    console.log(
      `[Engine] Card evaluation cache loaded from database: ${stats.loaded} cards`
    );
    cacheInitialized = true;
    return { loaded: stats.loaded, source: "database" };
  } catch (dbError) {
    // Fall back to JSON
    console.warn(
      "[Engine] Database loading failed, falling back to JSON:",
      dbError.message
    );
    try {
      cardEvalCache = cardEvalLoader.getCache();
      const stats = cardEvalCache.getStats();
      console.log(
        `[Engine] Card evaluation cache loaded from JSON: ${stats.loaded} cards`
      );
      cacheInitialized = true;
      return { loaded: stats.loaded, source: "json" };
    } catch (jsonError) {
      console.error(
        "[Engine] Failed to load evaluations from both database and JSON:",
        jsonError.message
      );
      cacheInitialized = false;
      return { loaded: 0, source: "failed", error: jsonError.message };
    }
  }
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seedString) {
  const seed = hashString(String(seedString || ""));
  return mulberry32(seed);
}

// T009: Updated theta with refined weights
// Updated: v3 with site-prioritization and no-sites-no-units rule
function loadTheta() {
  return {
    meta: {
      id: "refined/v3",
      description: "Site-prioritization + no units without mana base",
    },
    search: {
      beamWidth: 8,
      maxDepth: 3,
      quiescenceDepth: 1,
      nodeCap: 2000,
      budgetMs: 60,
      gamma: 0.6,
    },
    exploration: { epsilon_root: 0, gumbel_leaf: 0 },
    weights: {
      // Existing weights
      w_life: 0.8,
      w_lethal_now: 10.0, // Increased: prioritize lethal
      w_opp_lethal_next: -4.5,
      w_atk: 0.5,
      w_hp: 0.2,
      w_threats_my: 0.7,
      w_threats_opp: -0.6,
      w_hand: 0.2, // Reduced: don't overvalue hoarding cards
      w_draw_potential: 0.3,
      w_expected_two_for_one: 0.4,
      w_mana_waste: -0.7,
      w_on_curve: 0.9,
      w_engine_online: 1.2,
      w_combo_online: 1.0,
      w_tribal_count: 0.2,
      w_sweeper_risk: -0.8,
      w_win_more: -0.25,
      w_action_count_penalty: -0.02,
      w_mana_avail: 0.3, // Increased: reward having mana available
      w_sites: 2.0, // MASSIVELY increased: reward building mana base
      w_providers: 0.5, // Increased: reward mana providers
      w_thresholds_total: 0.5, // Increased: reward threshold diversity
      w_advance: 0.08,
      // New refined weights (T009)
      w_board_development: 0.8, // Reward deploying permanents
      w_mana_efficiency: 0.7, // Reward spending mana
      w_mana_efficiency_waste: -0.5, // Penalize wasted mana
      w_threat_deployment: 0.6, // Reward ATK on board
      w_life_pressure: 1.2, // Reward damage potential
      w_site_spam_penalty: -2.0, // Penalize site spam (sites >= 6)
      w_wasted_resources: -1.5, // Penalize passing with playable cards
      w_card_specific: 1.0, // Weight for card-specific evaluation (T036)
    },
    constraints: {
      clamp_eval_min: -50,
      clamp_eval_max: 50,
      legal_move_fallback: "pass_or_minimal",
    },
  };
}

function deepClone(x) {
  if (Array.isArray(x)) return x.map(deepClone);
  if (x && typeof x === "object") {
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepClone(x[k]);
    return o;
  }
  return x;
}

function mergeReplaceArrays(dst, src) {
  if (!src || typeof src !== "object") return dst;
  const out = Array.isArray(dst) ? [] : {};
  if (Array.isArray(src)) return deepClone(src);
  const keys = new Set([...Object.keys(dst || {}), ...Object.keys(src || {})]);
  for (const k of keys) {
    const dv = dst ? dst[k] : undefined;
    const sv = src[k];
    if (sv === undefined) {
      out[k] = deepClone(dv);
    } else if (Array.isArray(sv)) {
      out[k] = deepClone(sv);
    } else if (sv && typeof sv === "object") {
      out[k] = mergeReplaceArrays(dv && typeof dv === "object" ? dv : {}, sv);
    } else {
      out[k] = sv;
    }
  }
  return out;
}

function applyPatch(state, patch) {
  const next = mergeReplaceArrays(state || {}, patch || {});
  return next;
}

function seatNum(seat) {
  return seat === "p1" ? 1 : 2;
}

function otherSeat(seat) {
  return seat === "p1" ? "p2" : "p1";
}

function getZones(state, seat) {
  const z =
    state && state.zones && typeof state.zones === "object"
      ? state.zones[seat]
      : null;
  if (z && typeof z === "object") return z;
  return {
    spellbook: [],
    atlas: [],
    hand: [],
    graveyard: [],
    battlefield: [],
    collection: [],
    banished: [],
  };
}

function getAvatarPos(state, seat) {
  const av = state && state.avatars && state.avatars[seat];
  const pos = av && Array.isArray(av.pos) ? av.pos : null;
  if (pos) return pos;
  const w =
    (state && state.board && state.board.size && state.board.size.w) || 5;
  const h =
    (state && state.board && state.board.size && state.board.size.h) || 5;
  const cx = Math.floor(Math.max(1, Number(w) || 5) / 2);
  const yy = seat === "p1" ? (Number(h) || 5) - 1 : 0;
  return [cx, yy];
}

function ownedSiteKeys(state, seat) {
  const myNum = seatNum(seat);
  const sites = (state && state.board && state.board.sites) || {};
  const keys = [];
  for (const k of Object.keys(sites)) {
    const t = sites[k];
    if (t && t.card && Number(t.owner) === myNum) keys.push(k);
  }
  return keys;
}

// T044: Get opponent's site keys for targeting
function getOpponentSiteKeys(state, seat) {
  const oppNum = seatNum(otherSeat(seat));
  const sites = (state && state.board && state.board.sites) || {};
  const keys = [];
  for (const k of Object.keys(sites)) {
    const t = sites[k];
    if (t && t.card && Number(t.owner) === oppNum) keys.push(k);
  }
  return keys;
}

// T044: Count opponent's sites for strategy decisions
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function countOpponentSites(state, seat) {
  return getOpponentSiteKeys(state, seat).length;
}

function inBounds(x, y, w, h) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

function isEmpty(state, x, y) {
  const key = `${x},${y}`;
  const tile =
    state && state.board && state.board.sites && state.board.sites[key];
  return !(tile && tile.card);
}

// T050: Check if a unit has voidwalk keyword
function hasVoidwalk(unit) {
  if (!unit || !unit.item) return false;
  const card = unit.item.card;
  if (!card) return false;

  // Check keywords array
  const keywords = card.keywords || [];
  if (
    Array.isArray(keywords) &&
    keywords.some((k) => String(k).toLowerCase().includes("voidwalk"))
  ) {
    return true;
  }

  // Check rulesText for voidwalk mention
  const rulesText = String(card.rulesText || "").toLowerCase();
  if (rulesText.includes("voidwalk")) {
    return true;
  }

  return false;
}

// Keyword constants for combat, movement, and evaluation
const COMBAT_KEYWORDS = [
  "stealth", "airborne", "lethal", "ward", "initiative", "ranged",
  "burrow", "voidwalk", "guardian", "defender", "reach", "lifesteal",
  "genesis", "charge", "disable", "submerge",
  "immobile", "sideways",
];

/**
 * Extract all keywords from a card as a Set of lowercase strings.
 * Checks card.keywords array, rulesText, and falls back to cards_raw.json.
 * @param {object|null} card - Card object
 * @returns {Set<string>} Set of keyword strings
 */
function getCardKeywords(card) {
  const kw = new Set();
  if (!card) return kw;

  // 1. Check keywords array (if present)
  const keywords = card.keywords || [];
  if (Array.isArray(keywords)) {
    for (const k of keywords) {
      const s = String(k).toLowerCase();
      for (const word of COMBAT_KEYWORDS) {
        if (s.includes(word)) kw.add(word);
      }
    }
  }

  // 2. Check rulesText / text
  const text = String(card.rulesText || card.text || "").toLowerCase();
  for (const word of COMBAT_KEYWORDS) {
    if (text.includes(word)) kw.add(word);
  }

  return kw;
}

// T050: Check if movement from -> to is valid for this unit
function isValidMovement(state, fromKey, toKey, unit) {
  const toParsed = parseCellKey(toKey);
  if (!toParsed) return false;

  // If destination is void (empty), unit must have voidwalk
  const destIsVoid = isEmpty(state, toParsed.x, toParsed.y);
  if (destIsVoid && !hasVoidwalk(unit)) {
    return false;
  }

  // Immobile units cannot voluntarily move (but CAN attack in place)
  const card = unit && unit.item && unit.item.card ? unit.item.card : (unit && unit.card);
  if (card) {
    const kw = getCardKeywords(card);
    if (kw.has("immobile")) {
      return false; // Immobile units cannot move at all
    }

    // Sideways-only movement: can only move laterally (same row)
    if (kw.has("sideways")) {
      const fromParsed = parseCellKey(fromKey);
      if (fromParsed && toParsed) {
        if (fromParsed.y !== toParsed.y) {
          return false; // Not same row — sideways units can't move forward/backward
        }
      }
    }
  }

  return true;
}

function findAnyEmptyCell(state) {
  const w =
    (state && state.board && state.board.size && state.board.size.w) || 5;
  const h =
    (state && state.board && state.board.size && state.board.size.h) || 5;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (isEmpty(state, x, y)) return `${x},${y}`;
  return "0,0";
}

function findAnyOwnedSiteCell(state, seat) {
  try {
    const myNum = seatNum(seat);
    const sites = (state && state.board && state.board.sites) || {};
    for (const key of Object.keys(sites)) {
      const t = sites[key];
      if (t && t.card && Number(t.owner) === myNum) return key;
    }
  } catch {}
  return null;
}

function findAdjacentEmptyToOwned(state, seat) {
  const w =
    (state && state.board && state.board.size && state.board.size.w) || 5;
  const h =
    (state && state.board && state.board.size && state.board.size.h) || 5;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const keys = ownedSiteKeys(state, seat);
  for (const key of keys) {
    const [xs, ys] = key.split(",");
    const x0 = Number(xs);
    const y0 = Number(ys);
    for (const d of dirs) {
      const x = x0 + d[0];
      const y = y0 + d[1];
      if (inBounds(x, y, w, h) && isEmpty(state, x, y)) return `${x},${y}`;
    }
  }
  return null;
}

function chooseSiteFromHand(z) {
  const hand = Array.isArray(z.hand) ? z.hand : [];
  const idx = hand.findIndex((c) => {
    if (!c) return false;
    // Check card.type directly first
    if (typeof c.type === "string" && c.type.toLowerCase().includes("site")) return true;
    // Fallback: look up type from cards_raw.json via loader
    if (c.name && cardEvalLoader && typeof cardEvalLoader.getCardType === "function") {
      return cardEvalLoader.getCardType(c) === "site";
    }
    return false;
  });
  if (idx === -1) return null;
  return { idx, card: hand[idx] };
}

function getCardThresholds(card) {
  try {
    const th = card && card.thresholds ? card.thresholds : null;
    if (!th || typeof th !== "object") return null;
    const out = { air: 0, water: 0, earth: 0, fire: 0 };
    if (Number.isFinite(Number(th.air))) out.air = Number(th.air);
    if (Number.isFinite(Number(th.water))) out.water = Number(th.water);
    if (Number.isFinite(Number(th.earth))) out.earth = Number(th.earth);
    if (Number.isFinite(Number(th.fire))) out.fire = Number(th.fire);
    return out;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function hasThresholds(state, seat, req) {
  if (!req) return true;
  const have = countThresholdsForSeat(state, seat);
  return (
    (have.air || 0) >= (req.air || 0) &&
    (have.water || 0) >= (req.water || 0) &&
    (have.earth || 0) >= (req.earth || 0) &&
    (have.fire || 0) >= (req.fire || 0)
  );
}

function chooseNonSiteFromHand(state, seat, z) {
  const hand = Array.isArray(z.hand) ? z.hand : [];
  // Prefer board permanents: minion/unit/relic/structure/artifact; exclude sites/avatars
  const isPermanent = (c) => {
    const t = String(c?.type || "").toLowerCase();
    if (!t) return true;
    if (t.includes("site")) return false;
    if (t.includes("avatar")) return false;
    if (t.includes("minion")) return true;
    if (t.includes("unit")) return true;
    if (t.includes("relic")) return true;
    if (t.includes("structure")) return true;
    if (t.includes("artifact")) return true;
    // Fallback: treat unknown non-site, non-avatar as permanent
    return true;
  };
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (!c) continue;
    if (!isPermanent(c)) continue;
    // CRITICAL FIX: Use canAffordCard instead of just threshold check
    if (canAffordCard(state, seat, c)) return { idx: i, card: c };
  }
  return null;
}

function drawFromPilePatch(state, seat, pile) {
  const z = getZones(state, seat);
  const src = Array.isArray(z[pile]) ? [...z[pile]] : [];
  if (src.length === 0) return null;
  const top = src.shift();
  const hand = Array.isArray(z.hand) ? [...z.hand, top] : [top];
  const patch = { zones: {} };
  patch.zones[seat] = { ...z, [pile]: src, hand };
  return patch;
}

// Draw one card from Atlas (site deck)
function drawFromAtlasPatch(state, seat) {
  return drawFromPilePatch(state, seat, "atlas");
}

function getAvatar(state, seat) {
  try {
    return (
      (state &&
        state.avatars &&
        typeof state.avatars === "object" &&
        state.avatars[seat]) ||
      {}
    );
  } catch {
    return {};
  }
}

// Tap avatar to draw a site (cannot play a site afterward because avatar is tapped)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function drawFromAtlasWithTapPatch(state, seat) {
  const z = getZones(state, seat);
  const src = Array.isArray(z.atlas) ? [...z.atlas] : [];
  if (src.length === 0) return null;
  const top = src.shift();
  const hand = Array.isArray(z.hand) ? [...z.hand, top] : [top];
  const avPrev = getAvatar(state, seat) || {};
  const patch = { zones: {}, avatars: {} };
  patch.zones[seat] = { ...z, atlas: src, hand };
  patch.avatars[seat] = { ...avPrev, tapped: true };
  return patch;
}

// T045: Strategic site placement with defensive positioning
function playSitePatch(state, seat) {
  const z = getZones(state, seat);
  const hand = Array.isArray(z.hand) ? [...z.hand] : [];
  // Helper: check if a card is a site (with cards_raw.json fallback)
  const isSite = (c) => {
    if (!c) return false;
    if (typeof c.type === "string" && c.type.toLowerCase().includes("site")) return true;
    if (c.name && cardEvalLoader && typeof cardEvalLoader.getCardType === "function") {
      return cardEvalLoader.getCardType(c) === "site";
    }
    return false;
  };
  // Prefer Earth-like sites first (helps satisfy common early thresholds)
  let pick = null;
  const earthIdx = hand.findIndex(
    (c) =>
      isSite(c) &&
      String(c.name || "")
        .toLowerCase()
        .includes("valley")
  );
  if (earthIdx !== -1) pick = { idx: earthIdx, card: hand[earthIdx] };
  if (!pick) pick = chooseSiteFromHand({ hand });
  if (!pick) {
    const handTypes = hand.map(c => {
      const name = c && c.name ? c.name : '?';
      const rawType = c && c.type ? c.type : 'null';
      const resolved = isSite(c) ? 'site' : getCardTypeFromCard(c);
      return `${name}(type=${rawType},resolved=${resolved})`;
    });
    console.log(`[Bot Engine] playSitePatch: No site in hand (${hand.length} cards: ${handTypes.join(', ')})`);
    return null;
  }
  hand.splice(pick.idx, 1);

  // T045: Strategic placement logic
  const avatarPos = getAvatarPos(state, seat);
  const ownedSites = ownedSiteKeys(state, seat);
  const siteCount = ownedSites.length;

  let cell = null;

  if (siteCount === 0) {
    // Strategy 1: First site goes ON avatar position (or adjacent if occupied)
    const [ax, ay] = avatarPos;
    cell = isEmpty(state, ax, ay) ? `${ax},${ay}` : findAnyEmptyCell(state);
    console.log(
      `[Bot Engine] playSitePatch: First site at avatar position ${ax},${ay} -> cell ${cell}`
    );
  } else if (siteCount < 3) {
    // Strategy 2: Create defensive line near avatar (2-3 sites)
    cell =
      findDefensivePosition(state, seat, avatarPos) ||
      findAdjacentEmptyToOwned(state, seat) ||
      findAnyEmptyCell(state);
  } else {
    // Strategy 3: Expand toward opponent (4+ sites)
    const oppAvatarPos = getOpponentAvatarPos(state, seat);
    cell =
      findExpansionPosition(state, seat, oppAvatarPos, ownedSites) ||
      findAdjacentEmptyToOwned(state, seat) ||
      findAnyEmptyCell(state);
  }

  const myNum = seatNum(seat);
  const patch = { zones: {}, board: { sites: {} }, avatars: {} };
  patch.zones[seat] = { ...z, hand };
  patch.board.sites[cell] = { owner: myNum, tapped: false, card: pick.card };
  // Per rules p.20: "Tap → Play or draw a site" — playing a site taps the Avatar
  const avPrev = getAvatar(state, seat) || {};
  patch.avatars[seat] = { ...avPrev, tapped: true };
  console.log(
    `[Bot Engine] playSitePatch: Placing ${pick.card.name} at ${cell}, hand size after: ${hand.length}`
  );
  return patch;
}

// T045: Find defensive position near avatar - prioritize toward opponent
function findDefensivePosition(state, seat, avatarPos) {
  const [ax, ay] = avatarPos;
  const w =
    (state && state.board && state.board.size && state.board.size.w) || 5;
  const h =
    (state && state.board && state.board.size && state.board.size.h) || 5;
  const oppPos = getOpponentAvatarPos(state, seat);

  // Defensive positions: adjacent to avatar, prioritized by distance to opponent
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const candidates = offsets
    .map(([dx, dy]) => ({ x: ax + dx, y: ay + dy }))
    .filter(({ x, y }) => inBounds(x, y, w, h) && isEmpty(state, x, y))
    .map((c) => ({ ...c, dist: manhattan([c.x, c.y], oppPos) }));

  // Sort: closest to opponent first (expand forward before sideways)
  candidates.sort((a, b) => a.dist - b.dist);

  if (candidates.length > 0) {
    return `${candidates[0].x},${candidates[0].y}`;
  }
  return null;
}

// T045: Find expansion position toward opponent
// T051: Strategic expansion - prioritize placing sites adjacent to enemy sites for traversal
function findExpansionPosition(state, seat, oppAvatarPos, ownedSites) {
  const w =
    (state && state.board && state.board.size && state.board.size.w) || 5;
  const h =
    (state && state.board && state.board.size && state.board.size.h) || 5;

  // Get enemy sites for adjacency checking
  const oppSiteKeys = getOpponentSiteKeys(state, seat);
  const oppSitePositions = oppSiteKeys
    .map((sk) => parseCellKey(sk))
    .filter(Boolean);

  // Helper: Check if position is adjacent to any enemy site
  const isAdjacentToEnemySite = (x, y) => {
    return oppSitePositions.some((oppPos) => {
      const dx = Math.abs(oppPos.x - x);
      const dy = Math.abs(oppPos.y - y);
      return dx + dy === 1; // Manhattan distance of 1 = adjacent
    });
  };

  // Strategy 1 (HIGHEST PRIORITY): Place adjacent to enemy sites for traversal
  // This allows units to move between our sites and enemy sites
  for (const sk of ownedSites) {
    const pos = parseCellKey(sk);
    if (!pos) continue;

    const candidates = [
      [pos.x + 1, pos.y],
      [pos.x - 1, pos.y],
      [pos.x, pos.y + 1],
      [pos.x, pos.y - 1],
    ];

    // Filter to empty cells adjacent to enemy sites
    const adjacentToEnemy = candidates
      .filter(
        ([x, y]) =>
          inBounds(x, y, w, h) &&
          isEmpty(state, x, y) &&
          isAdjacentToEnemySite(x, y)
      )
      .map(([x, y]) => ({ x, y }));

    if (adjacentToEnemy.length > 0) {
      // Pick the one closest to opponent avatar
      adjacentToEnemy.sort((a, b) => {
        const distA = manhattan([a.x, a.y], oppAvatarPos);
        const distB = manhattan([b.x, b.y], oppAvatarPos);
        return distA - distB;
      });
      const best = adjacentToEnemy[0];
      return `${best.x},${best.y}`;
    }
  }

  // Strategy 2 (FALLBACK): Move closer to opponent if no enemy-adjacent positions available
  const sitesWithDist = ownedSites
    .map((sk) => {
      const p = parseCellKey(sk);
      const dist = p ? manhattan([p.x, p.y], oppAvatarPos) : 999;
      return { key: sk, pos: p, dist };
    })
    .filter((s) => s.pos !== null);

  sitesWithDist.sort((a, b) => a.dist - b.dist);

  for (const siteInfo of sitesWithDist) {
    const { pos } = siteInfo;
    if (!pos) continue;

    const candidates = [
      [pos.x + 1, pos.y],
      [pos.x - 1, pos.y],
      [pos.x, pos.y + 1],
      [pos.x, pos.y - 1],
    ];

    const candidatesWithDist = candidates
      .filter(([x, y]) => inBounds(x, y, w, h) && isEmpty(state, x, y))
      .map(([x, y]) => {
        const dist = manhattan([x, y], oppAvatarPos);
        return { x, y, dist };
      });

    candidatesWithDist.sort((a, b) => a.dist - b.dist);

    if (candidatesWithDist.length > 0) {
      const best = candidatesWithDist[0];
      return `${best.x},${best.y}`;
    }
  }

  return null;
}

// Find the best owned site cell for unit placement, preferring cells with fewer units
// and closer to opponent (for faster attack reach)
function findBestUnitPlacementCell(state, seat, card) {
  try {
    const myNum = seatNum(seat);
    const oppNum = seatNum(otherSeat(seat));
    const sites = (state && state.board && state.board.sites) || {};
    const perms = (state && state.permanents) || {};
    const oppPos = getOpponentAvatarPos(state, seat);
    const myPos = getAvatarPos(state, seat);

    // Collect all enemy presence positions (units, sites, avatar)
    const enemyPositions = [oppPos];
    for (const k of Object.keys(perms)) {
      const arr = Array.isArray(perms[k]) ? perms[k] : [];
      if (arr.some(p => p && Number(p.owner) === oppNum)) {
        const pos = parseCellKey(k);
        if (pos) enemyPositions.push([pos.x, pos.y]);
      }
    }
    for (const k of Object.keys(sites)) {
      const t = sites[k];
      if (t && t.card && Number(t.owner) === oppNum) {
        const pos = parseCellKey(k);
        if (pos) enemyPositions.push([pos.x, pos.y]);
      }
    }

    const candidates = [];
    for (const key of Object.keys(sites)) {
      const t = sites[key];
      if (!t || !t.card || Number(t.owner) !== myNum) continue;
      const arr = Array.isArray(perms[key]) ? perms[key] : [];
      const friendlyCount = arr.filter(
        (p) => p && Number(p.owner) === myNum
      ).length;
      const pos = parseCellKey(key);
      const distToEnemy = pos
        ? Math.min(...enemyPositions.map(ep => manhattan([pos.x, pos.y], ep)))
        : 999;
      const distToMyAvatar = pos ? manhattan([pos.x, pos.y], myPos) : 999;
      candidates.push({ key, friendlyCount, distToEnemy, distToMyAvatar });
    }
    if (candidates.length === 0) return null;

    // Role-aware placement: defensive units near own avatar, offensive near enemy
    const atk = card ? Number(card.attack || 0) : 0;
    const def = card ? Number(card.defence || card.defense || 0) : 0;
    const isDefensive = def > atk && def >= 3;

    candidates.sort((a, b) => {
      if (a.friendlyCount !== b.friendlyCount)
        return a.friendlyCount - b.friendlyCount;
      if (isDefensive) {
        return a.distToMyAvatar - b.distToMyAvatar; // Near own avatar
      }
      return a.distToEnemy - b.distToEnemy; // Near enemy presence
    });
    return candidates[0].key;
  } catch {
    return null;
  }
}

function playUnitPatch(state, seat, placedCell, specificCard = null) {
  const z = getZones(state, seat);
  const hand = Array.isArray(z.hand) ? [...z.hand] : [];

  let pick = null;

  // If specific card provided, use it and find its index
  if (specificCard) {
    const idx = hand.findIndex(
      (c) => c === specificCard || (c && c.slug === specificCard.slug)
    );
    if (idx !== -1) {
      pick = { idx, card: hand[idx] };
    }
  } else {
    // Otherwise, choose first affordable non-site from hand
    pick = chooseNonSiteFromHand(state, seat, { hand });
  }

  if (!pick) return null;

  // CRITICAL: Validate affordability before creating patch
  if (!canAffordCard(state, seat, pick.card)) {
    return null; // Don't generate illegal move
  }

  hand.splice(pick.idx, 1);
  let cell = placedCell || findBestUnitPlacementCell(state, seat, pick.card);
  if (!cell) cell = findAnyOwnedSiteCell(state, seat);
  if (!cell) cell = findAnyEmptyCell(state);
  const myNum = seatNum(seat);
  const existing = (state && state.permanents && state.permanents[cell]) || [];
  const patch = { zones: {}, permanents: {} };
  patch.zones[seat] = { ...z, hand };
  patch.permanents[cell] = [
    ...existing,
    { owner: myNum, card: pick.card, tapped: false, summonedThisTurn: true },
  ];
  // Track mana spent locally so engine knows remaining mana for multi-action turns
  const cost = getCardManaCost(pick.card);
  if (cost > 0) {
    const resources = (state && state.resources) || {};
    const myRes = resources[seat] || {};
    const prevSpent = Number(myRes.spentThisTurn) || 0;
    patch.resources = {};
    patch.resources[seat] = { spentThisTurn: prevSpent + cost };
  }
  return patch;
}

// Site Type Detection - identify Site cards
function isSiteCard(card) {
  if (!card || !card.type) return false;
  const cardType = String(card.type).toLowerCase();
  return cardType.includes("site");
}

// T043: Spell Type Detection - identify Magic/Sorcery/Aura cards
function isSpellCard(card) {
  if (!card || !card.type) return false;
  const cardType = String(card.type).toLowerCase();

  // Exclude non-spell types
  if (cardType.includes("site")) return false;
  if (cardType.includes("avatar")) return false;
  if (cardType.includes("minion")) return false;
  if (cardType.includes("unit")) return false;
  if (cardType.includes("relic")) return false;
  if (cardType.includes("structure")) return false;
  if (cardType.includes("artifact")) return false;

  // Include spell types
  if (cardType.includes("magic")) return true; // Instant spells
  if (cardType.includes("sorcery")) return true; // Slow spells
  if (cardType.includes("aura")) return true; // Enchantments
  if (cardType.includes("enchantment")) return true; // Alternative naming

  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isAuraCard(card) {
  if (!card || !card.type) return false;
  const cardType = String(card.type).toLowerCase();
  return cardType.includes("aura") || cardType.includes("enchantment");
}

// T043: Spell Casting - create patch for playing spells
function playSpellPatch(state, seat, specificCard = null) {
  const z = getZones(state, seat);
  const hand = Array.isArray(z.hand) ? [...z.hand] : [];

  let pick = null;

  // If specific card provided, use it
  if (specificCard) {
    const idx = hand.findIndex(
      (c) => c === specificCard || (c && c.slug === specificCard.slug)
    );
    if (idx !== -1 && isSpellCard(hand[idx])) {
      pick = { idx, card: hand[idx] };
    }
  } else {
    // Otherwise, find first affordable spell
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (!c || !isSpellCard(c)) continue;
      if (canAffordCard(state, seat, c)) {
        pick = { idx: i, card: c };
        break;
      }
    }
  }

  if (!pick) return null;

  // Validate affordability
  if (!canAffordCard(state, seat, pick.card)) {
    return null;
  }

  hand.splice(pick.idx, 1);

  // Auras and enchantments go to battlefield (attached to permanents)
  // Instant spells (Magic) and Sorceries resolve immediately (server handles effect)
  const cardType = String(pick.card.type || "").toLowerCase();

  // Track mana spent for spells
  const spellCost = getCardManaCost(pick.card);
  const addResourceTracking = (patch) => {
    if (spellCost > 0) {
      const resources = (state && state.resources) || {};
      const myRes = resources[seat] || {};
      const prevSpent = Number(myRes.spentThisTurn) || 0;
      patch.resources = {};
      patch.resources[seat] = { spentThisTurn: prevSpent + spellCost };
    }
    return patch;
  };

  if (cardType.includes("aura") || cardType.includes("enchantment")) {
    // Place aura on battlefield at owned site
    let cell = findAnyOwnedSiteCell(state, seat);
    if (!cell) cell = findAnyEmptyCell(state);

    const myNum = seatNum(seat);
    const existing =
      (state && state.permanents && state.permanents[cell]) || [];
    const patch = { zones: {}, permanents: {} };
    patch.zones[seat] = { ...z, hand };
    patch.permanents[cell] = [
      ...existing,
      { owner: myNum, card: pick.card, tapped: false },
    ];
    return addResourceTracking(patch);
  } else {
    // Magic (instant) / Sorcery - remove from hand and add to graveyard
    const graveyard = Array.isArray(z.graveyard) ? [...z.graveyard] : [];
    graveyard.push(pick.card);
    const patch = { zones: {}, _spellCast: true, _spellCard: pick.card };
    patch.zones[seat] = { ...z, hand, graveyard };
    return addResourceTracking(patch);
  }
}

function endTurnPatch(state, seat) {
  const my = seatNum(seat);
  const other = my === 1 ? 2 : 1;
  // Use phase: "Start" to match the real client's endTurn behavior
  // The server expects Start phase for proper turn transitions (untap, draw, etc.)
  return { currentPlayer: other, phase: "Start" };
}

// --- Movement helpers --------------------------------------------------------
function parseCellKey(key) {
  try {
    const [xs, ys] = String(key).split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  } catch {}
  return null;
}

function getOpponentAvatarPos(state, seat) {
  try {
    return getAvatarPos(state, otherSeat(seat));
  } catch {
    return [2, seat === "p1" ? 0 : 3];
  }
}

function myUnits(state, seat) {
  const out = [];
  const myNum = seatNum(seat);
  const per = (state && state.permanents) || {};
  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      try {
        if (item && Number(item.owner) === myNum)
          out.push({ at: cellKey, index: i, item });
      } catch {}
    }
  }
  return out;
}

function neighborsInBounds(state, atKey) {
  const pos = parseCellKey(atKey);
  const w =
    (state && state.board && state.board.size && state.board.size.w) || 5;
  const h =
    (state && state.board && state.board.size && state.board.size.h) || 5;
  if (!pos) return [];
  const candidates = [
    [pos.x + 1, pos.y],
    [pos.x - 1, pos.y],
    [pos.x, pos.y + 1],
    [pos.x, pos.y - 1],
  ];
  const res = [];
  for (const [x, y] of candidates)
    if (inBounds(x, y, w, h)) res.push(`${x},${y}`);
  return res;
}

function hasEnemyAt(state, seat, cellKey) {
  const opp = seatNum(otherSeat(seat));
  const arr = (state && state.permanents && state.permanents[cellKey]) || [];
  if (!Array.isArray(arr)) return false;
  for (const p of arr)
    try {
      if (Number(p.owner) === opp) return true;
    } catch {}
  return false;
}

function hasFriendlyAt(state, seat, cellKey) {
  const me = seatNum(seat);
  const arr = (state && state.permanents && state.permanents[cellKey]) || [];
  if (!Array.isArray(arr)) return false;
  for (const p of arr)
    try {
      if (Number(p.owner) === me) return true;
    } catch {}
  return false;
}

function manhattan(a, b) {
  try {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  } catch {
    return 0;
  }
}

function buildMovePatch(state, seat, fromKey, index, toKey) {
  try {
    // Avatar movement: index === -1 means we're moving the avatar, not a permanent
    if (index === -1) {
      const toPos = parseCellKey(toKey);
      if (!toPos) return null;
      const myAvatar = state && state.avatars && state.avatars[seat];
      const avatarCard = (myAvatar && myAvatar.card) || { name: "Avatar", type: "Avatar", attack: 1 };
      const patch = {
        avatars: {
          [seat]: {
            ...myAvatar,
            pos: [toPos.x, toPos.y],
            tapped: true,
          },
        },
      };
      // Annotate attack moves with metadata for combat protocol
      if (hasEnemyAt(state, seat, toKey) || isOpponentAvatarCell(state, seat, toKey) || isOpponentSiteCell(state, seat, toKey)) {
        const myNum = seatNum(seat);
        patch._attackMeta = {
          fromKey,
          toKey,
          attackerIndex: -1,
          attackerOwner: myNum,
          attackerCard: avatarCard,
          isAvatarAttack: true,
          tile: { x: toPos.x, y: toPos.y },
        };
      }
      return patch;
    }

    const perPrev = (state && state.permanents) || {};
    const fromArrPrev = Array.isArray(perPrev[fromKey]) ? perPrev[fromKey] : [];
    const fromArr = [...fromArrPrev];
    const spliced = fromArr.splice(index, 1);
    const item = spliced[0];
    if (!item) return null;
    const toArrPrev = Array.isArray(perPrev[toKey]) ? perPrev[toKey] : [];
    const toArr = [...toArrPrev, { ...item, tapped: true }];
    const patch = { permanents: { [fromKey]: fromArr, [toKey]: toArr } };
    // Annotate attack moves with metadata for combat protocol
    if (hasEnemyAt(state, seat, toKey) || isOpponentAvatarCell(state, seat, toKey) || isOpponentSiteCell(state, seat, toKey)) {
      const myNum = seatNum(seat);
      const toPos = parseCellKey(toKey);
      patch._attackMeta = {
        fromKey,
        toKey,
        attackerIndex: toArr.length - 1,
        attackerOwner: myNum,
        attackerCard: item.card || null,
        tile: toPos ? { x: toPos.x, y: toPos.y } : { x: 0, y: 0 },
      };
    }
    return patch;
  } catch {
    return null;
  }
}

function isOpponentAvatarCell(state, seat, cellKey) {
  try {
    const oppPos = getOpponentAvatarPos(state, seat);
    return cellKey === `${oppPos[0]},${oppPos[1]}`;
  } catch { return false; }
}

function isOpponentSiteCell(state, seat, cellKey) {
  try {
    const oppNum = seatNum(otherSeat(seat));
    const sites = (state && state.board && state.board.sites) || {};
    const tile = sites[cellKey];
    return tile && tile.card && Number(tile.owner) === oppNum;
  } catch { return false; }
}

// T044: Enhanced movement with site targeting
// T057: Respects summoning sickness - units cannot attack if summonedThisTurn = true
// RULES: Attacking sites causes opponent to LOSE LIFE (not take damage)
// Attacking sites CANNOT deliver death blow (must attack avatar for that)
// Sites are valid targets EXCEPT when opponent is at death's door (0 life)
// Units with summoning sickness CAN move/defend but CANNOT attack
function generateMoveCandidates(state, seat) {
  // T057: Filter out tapped units, summoning sick, and non-combat permanents
  const allMyUnits = myUnits(state, seat);
  const units = allMyUnits.filter((u) => {
    if (u.item?.tapped) return false; // Must be untapped
    if (u.item?.summonedThisTurn) return false; // T057: Cannot attack with summoning sickness
    // Exclude non-combat permanents (Auras, 0-attack units) from attack candidates
    const cardType = String(u.item?.card?.type || "").toLowerCase();
    if (cardType.includes("aura") || cardType.includes("enchantment") || cardType.includes("artifact")) return false;
    const atk = Number(u.item?.card?.attack || 0);
    if (atk <= 0) return false; // No point attacking with 0-attack units
    return true;
  });

  // Include our own avatar as a movable/attackable unit
  // The avatar is stored separately in state.avatars[seat], not in permanents
  const myAvatar = state && state.avatars && state.avatars[seat];
  if (myAvatar && Array.isArray(myAvatar.pos) && !myAvatar.tapped) {
    const avatarAtk = Number(myAvatar.card?.attack || 1); // Avatar default ATK is 1
    if (avatarAtk > 0) {
      const avatarCellKey = `${myAvatar.pos[0]},${myAvatar.pos[1]}`;
      units.push({
        at: avatarCellKey,
        index: -1, // Special index to indicate avatar (not a permanents array element)
        item: {
          owner: seatNum(seat),
          card: myAvatar.card || { name: "Avatar", type: "Avatar", attack: 1, defence: 0 },
          tapped: false,
          _isAvatar: true, // Tag for special handling in buildMovePatch
        },
      });
    }
  }

  // Diagnostic: log movement candidate generation
  try {
    if (allMyUnits.length > 0 || units.length > 0) {
      const tapped = allMyUnits.filter(u => u.item?.tapped).length;
      const sick = allMyUnits.filter(u => u.item?.summonedThisTurn).length;
      const hasAvatar = units.some(u => u.item?._isAvatar);
      console.log(`[Engine] Movement: ${allMyUnits.length} total units, ${units.length} can attack (${tapped} tapped, ${sick} sick${hasAvatar ? ', +avatar' : ''})`);
    }
  } catch {}
  if (!units.length) return [];

  const oppPos = getOpponentAvatarPos(state, seat);
  const oppSites = getOpponentSiteKeys(state, seat);

  // Check if opponent is at death's door (life = 0)
  const players = (state && state.players) || {};
  const oppPlayer = players[otherSeat(seat)] || {};
  const oppLife = Number(oppPlayer.life) || 20;
  const oppAtDeathsDoor = oppLife <= 0;

  // CRITICAL RULE: Final blow must be to avatar when opponent is at 0 life
  // Otherwise, sites are valid damage targets
  let targetPositions = [];

  if (oppAtDeathsDoor) {
    // Opponent at 0 life - MUST target avatar for final blow
    targetPositions = [oppPos];
  } else {
    // Opponent still has life - can target sites OR avatar
    // Include both as valid targets (prioritize closer ones)
    const sitePositions = oppSites
      .map((sk) => {
        const p = parseCellKey(sk);
        return p ? [p.x, p.y] : null;
      })
      .filter(Boolean);

    targetPositions = [oppPos, ...sitePositions];
  }

  if (targetPositions.length === 0) {
    targetPositions = [oppPos]; // Fallback to avatar
  }

  // Sort units by distance to closest target
  units.sort((a, b) => {
    const ap = parseCellKey(a.at);
    const bp = parseCellKey(b.at);

    const aDistances = targetPositions.map((t) =>
      ap ? manhattan([ap.x, ap.y], t) : 999
    );
    const bDistances = targetPositions.map((t) =>
      bp ? manhattan([bp.x, bp.y], t) : 999
    );

    const aMin = Math.min(...aDistances);
    const bMin = Math.min(...bDistances);

    return aMin - bMin;
  });

  const candidates = [];
  const oppAvatarKey = `${oppPos[0]},${oppPos[1]}`;
  const oppSiteNum = seatNum(otherSeat(seat));

  // Generate movement candidates for up to 5 closest units (not just one)
  const maxUnitsToConsider = Math.min(units.length, 5);
  for (let ui = 0; ui < maxUnitsToConsider; ui++) {
    const chosen = units[ui];
    const chosenPos = parseCellKey(chosen.at);
    const chosenDist = chosenPos ? Math.min(...targetPositions.map(t => manhattan([chosenPos.x, chosenPos.y], t))) : 999;
    // T050: Filter neighbors to exclude void unless unit has voidwalk
    // Allow movement to friendly-occupied cells if it advances toward enemy
    const allNeigh = neighborsInBounds(state, chosen.at);
    const neigh = allNeigh
      .filter((k) => {
        if (!isValidMovement(state, chosen.at, k, chosen)) return false;
        // Always allow movement to enemy cells or empty cells
        if (hasEnemyAt(state, seat, k)) return true;
        if (!hasFriendlyAt(state, seat, k)) return true;
        // Allow movement through friendly cells if advancing toward enemy
        const kPos = parseCellKey(k);
        if (!kPos) return false;
        const kDist = Math.min(...targetPositions.map(t => manhattan([kPos.x, kPos.y], t)));
        return kDist < chosenDist; // Only advance, don't retreat through friendlies
      });

    // Diagnostic: log movement options for first 3 units
    if (ui < 3) {
      try {
        const blocked = allNeigh.filter(k => hasFriendlyAt(state, seat, k) && !neigh.includes(k));
        const voidCells = allNeigh.filter(k => !isValidMovement(state, chosen.at, k, chosen));
        if (allNeigh.length > 0) {
          console.log(`[Engine] Move[${ui}] from ${chosen.at}: ${neigh.length} valid (${blocked.length} friendly-blocked, ${voidCells.length} void-blocked) of ${allNeigh.length}`);
        }
      } catch {}
    }

    if (neigh.length === 0) continue;

    // Prefer moving into a cell with an enemy (unit, avatar, or site)
    // Skip cells where ALL enemy units have Stealth (cannot be targeted)
    const intoEnemy = neigh.filter((k) => {
      if (!hasEnemyAt(state, seat, k)) return false;
      const arr = (state && state.permanents && state.permanents[k]) || [];
      const oppNum = seatNum(otherSeat(seat));
      const enemies = arr.filter(p => p && Number(p.owner) === oppNum);
      // If there are enemy units and ALL have stealth, can't attack this cell
      if (enemies.length > 0 && enemies.every(p => getCardKeywords(p && p.card).has("stealth"))) {
        return false;
      }
      return true;
    });
    const intoSite = !oppAtDeathsDoor
      ? neigh.filter((k) => {
          const sites = (state && state.board && state.board.sites) || {};
          const tile = sites[k];
          return tile && Number(tile.owner) === oppSiteNum;
        })
      : [];

    // T101: Attack priority - sites FIRST for mana denial (except lethal)
    const chosenAtk = Number(chosen.item?.card?.attack || 0);
    const canDeliverLethal = oppAtDeathsDoor || chosenAtk >= oppLife;

    const intoAvatar = intoEnemy.filter((k) => k === oppAvatarKey);
    const intoOtherEnemy = intoEnemy.filter((k) => k !== oppAvatarKey);

    let priorityTargets = [];
    if (canDeliverLethal && intoAvatar.length > 0) {
      priorityTargets = intoAvatar;
    } else {
      priorityTargets = [
        ...intoSite.filter((k) => !intoEnemy.includes(k)),
        ...intoOtherEnemy,
        ...intoAvatar,
      ];
    }

    if (priorityTargets.length > 0) {
      for (const k of priorityTargets.slice(0, 2)) {
        const p = buildMovePatch(state, seat, chosen.at, chosen.index, k);
        if (p) candidates.push(p);
      }
    } else {
      // Move toward closest target
      const sorted = [...neigh].sort((k1, k2) => {
        const p1 = parseCellKey(k1);
        const p2 = parseCellKey(k2);
        const d1Arr = targetPositions.map((t) =>
          p1 ? manhattan([p1.x, p1.y], t) : 999
        );
        const d2Arr = targetPositions.map((t) =>
          p2 ? manhattan([p2.x, p2.y], t) : 999
        );
        return Math.min(...d1Arr) - Math.min(...d2Arr);
      });

      for (const k of sorted.slice(0, 1)) {
        const p = buildMovePatch(state, seat, chosen.at, chosen.index, k);
        if (p) candidates.push(p);
      }
    }
  }

  return candidates;
}

// Minimal providers (copied subset from server rules to avoid imports)
const MANA_PROVIDER_BY_NAME = new Set([
  "abundance",
  "amethyst core",
  "aquamarine core",
  "atlantean fate",
  "avalon",
  "blacksmith family",
  "caerleon-upon-usk",
  "castle servants",
  "common cottagers",
  "finwife",
  "fisherman's family",
  "glastonbury tor",
  "joyous garde",
  "onyx core",
  "pristine paradise",
  "ruby core",
  "shrine of the dragonlord",
  "the colour out of space",
  "tintagel",
  "valley of delight",
  "wedding hall",
  "älvalinne dryads",
]);

const THRESHOLD_GRANT_BY_NAME = {
  "amethyst core": { air: 1 },
  "aquamarine core": { water: 1 },
  "onyx core": { earth: 1 },
  "ruby core": { fire: 1 },
};

// Fallback thresholds for standard sites by name when card.thresholds is missing
const SITE_THRESHOLD_BY_NAME = {
  spire: { air: 1 },
  stream: { water: 1 },
  valley: { earth: 1 },
  wasteland: { fire: 1 },
};

function accumulateThresholds(acc, src) {
  if (!src || typeof src !== "object") return;
  const keys = ["air", "water", "earth", "fire"];
  for (const k of keys) {
    const v = Number(src[k] || 0);
    if (Number.isFinite(v) && v !== 0) acc[k] = (acc[k] || 0) + v;
  }
}

function countThresholdsForSeat(state, seat) {
  const out = { air: 0, water: 0, earth: 0, fire: 0 };
  const myNum = seatNum(seat);
  const sites = (state && state.board && state.board.sites) || {};
  for (const key of Object.keys(sites)) {
    const tile = sites[key];
    if (!tile || Number(tile.owner) !== myNum) continue;
    let th =
      tile && tile.card && tile.card.thresholds ? tile.card.thresholds : null;
    if (!th) {
      try {
        const nm = (
          tile && tile.card && tile.card.name ? String(tile.card.name) : ""
        ).toLowerCase();
        if (nm && SITE_THRESHOLD_BY_NAME[nm]) th = SITE_THRESHOLD_BY_NAME[nm];
      } catch {}
    }
    accumulateThresholds(out, th);
  }
  const per = (state && state.permanents) || {};
  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      if (!p || Number(p.owner) !== myNum) continue;
      const nm = (
        p.card && p.card.name ? String(p.card.name) : ""
      ).toLowerCase();
      const grant = THRESHOLD_GRANT_BY_NAME[nm];
      if (grant) accumulateThresholds(out, grant);
    }
  }
  return out;
}

function countOwnedManaSites(state, seat) {
  let n = 0;
  const myNum = seatNum(seat);
  const sites = (state && state.board && state.board.sites) || {};
  for (const key of Object.keys(sites)) {
    const tile = sites[key];
    if (!tile || Number(tile.owner) !== myNum) continue;
    // Assume most sites provide 1
    if (tile.card) n++;
  }
  return n;
}

function countManaProvidersFromPermanents(state, seat) {
  let n = 0;
  const myNum = seatNum(seat);
  const per = (state && state.permanents) || {};
  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      try {
        if (!p || Number(p.owner) !== myNum) continue;
        const nm = (
          p.card && p.card.name ? String(p.card.name) : ""
        ).toLowerCase();
        if (MANA_PROVIDER_BY_NAME.has(nm)) n++;
      } catch {}
    }
  }
  return n;
}

// T002: Cost and Threshold Validation - check if a card can be afforded
// NOTE: Card costs are enriched by server (see server/index.js enrichPatchWithCosts)
function getCardManaCost(card) {
  // Extract generic mana cost from card
  try {
    if (card && typeof card.cost === "number") return Number(card.cost);
    if (card && card.cost && typeof card.cost === "string") {
      const parsed = parseInt(card.cost, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    // Try alternate cost fields
    if (card && typeof card.manaCost === "number") return Number(card.manaCost);
    if (card && typeof card.generic === "number") return Number(card.generic);
    // Sites don't have costs - they're played via Avatar ability
    return 0;
  } catch {
    return 0;
  }
}

function countUntappedMana(state, seat) {
  // Count untapped sites
  const myNum = seatNum(seat);
  const sites = (state && state.board && state.board.sites) || {};
  let mana = 0;

  for (const key of Object.keys(sites)) {
    const tile = sites[key];
    if (!tile || !tile.card) continue;
    if (Number(tile.owner) === myNum && tile.tapped !== true) {
      mana++;
    }
  }

  // Add untapped mana providers
  const per = (state && state.permanents) || {};
  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      try {
        if (!p || Number(p.owner) !== myNum || p.tapped === true) continue;
        const nm = (
          p.card && p.card.name ? String(p.card.name) : ""
        ).toLowerCase();
        if (MANA_PROVIDER_BY_NAME.has(nm)) mana++;
      } catch {}
    }
  }

  return mana;
}

function meetsThresholds(have, required) {
  if (!required) return true;
  const req = required || {};
  const h = have || { air: 0, water: 0, earth: 0, fire: 0 };
  return (
    (h.air || 0) >= (req.air || 0) &&
    (h.water || 0) >= (req.water || 0) &&
    (h.earth || 0) >= (req.earth || 0) &&
    (h.fire || 0) >= (req.fire || 0)
  );
}

function canAffordCard(state, seat, card) {
  if (!card) return false;

  // Sites don't cost mana (played via Avatar ability)
  const cardType = (card.type || "").toLowerCase();
  if (cardType.includes("site")) return true;

  // CRITICAL: Cannot play units when you have no sites on the board
  // This is a fundamental game rule - you need mana base before deploying creatures
  const ownedSites = countOwnedManaSites(state, seat);
  if (ownedSites === 0) return false;

  // Check mana cost WITH awareness of mana already spent this turn
  const totalMana = countUntappedMana(state, seat);
  const resources = (state && state.resources) || {};
  const myRes = resources[seat] || {};
  const manaSpent = Number(myRes.spentThisTurn) || 0;
  const available = totalMana - manaSpent; // Subtract mana spent earlier this turn
  const cost = getCardManaCost(card);
  if (available < cost) return false;

  // Check threshold requirements
  const thresholds = countThresholdsForSeat(state, seat);
  const required = getCardThresholds(card);
  return meetsThresholds(thresholds, required);
}

// T003: Win Condition Detection - detect when opponent can be defeated
function detectWinCondition(state, seat) {
  const opp = otherSeat(seat);
  const players = (state && state.players) || {};
  const oppPlayer = players[opp] || {};
  const oppLife = Number(oppPlayer.life) || 0;

  // Check if opponent is at death's door (life = 0)
  const oppAtDeathsDoor = oppLife <= 0;

  // Check if we can deal damage for lethal (simplified: check if we have any threats)
  const per = (state && state.permanents) || {};
  const myNum = seatNum(seat);
  let canDealDamage = false;

  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      if (p && Number(p.owner) === myNum && !p.tapped) {
        // Has untapped unit that could attack
        const atk = Number(p.card && p.card.attack) || 0;
        if (atk > 0) {
          canDealDamage = true;
          break;
        }
      }
    }
    if (canDealDamage) break;
  }

  return {
    oppAtDeathsDoor,
    canDealLethal: oppAtDeathsDoor && canDealDamage,
    oppLife,
  };
}

// T001: Build explicit game state model with resources, thresholds, turn state, and win conditions
function buildGameStateModel(serverState, seat) {
  const me = seat;
  const opp = otherSeat(seat);

  // Count untapped vs tapped sites for mana tracking
  const myNum = seatNum(me);
  const sites =
    (serverState && serverState.board && serverState.board.sites) || {};
  let sitesUntappedMy = 0;
  let sitesTappedMy = 0;
  let sitesUntappedOpp = 0;
  let sitesTappedOpp = 0;

  for (const key of Object.keys(sites)) {
    const tile = sites[key];
    if (!tile || !tile.card) continue;
    const owner = Number(tile.owner);
    const tapped = tile.tapped === true;

    if (owner === myNum) {
      if (tapped) sitesTappedMy++;
      else sitesUntappedMy++;
    } else if (owner === seatNum(opp)) {
      if (tapped) sitesTappedOpp++;
      else sitesUntappedOpp++;
    }
  }

  // Count untapped mana providers
  const per = (serverState && serverState.permanents) || {};
  let providersUntappedMy = 0;
  let providersUntappedOpp = 0;

  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      try {
        if (!p) continue;
        const nm = (
          p.card && p.card.name ? String(p.card.name) : ""
        ).toLowerCase();
        if (!MANA_PROVIDER_BY_NAME.has(nm)) continue;
        const owner = Number(p.owner);
        const tapped = p.tapped === true;

        if (owner === myNum && !tapped) providersUntappedMy++;
        else if (owner === seatNum(opp) && !tapped) providersUntappedOpp++;
      } catch {}
    }
  }

  // Calculate mana available (untapped sites + untapped providers)
  const manaAvailableMy = sitesUntappedMy + providersUntappedMy;
  const manaAvailableOpp = sitesUntappedOpp + providersUntappedOpp;

  // Extract mana spent this turn from resources
  const resources = (serverState && serverState.resources) || {};
  const myRes = resources[me] || {};
  const oppRes = resources[opp] || {};
  const manaSpentMy = Number(myRes.spentThisTurn) || 0;
  const manaSpentOpp = Number(oppRes.spentThisTurn) || 0;

  // Get thresholds
  const thresholdsMy = countThresholdsForSeat(serverState, me);
  const thresholdsOpp = countThresholdsForSeat(serverState, opp);

  // Get turn state
  const currentPlayer = (serverState && serverState.currentPlayer) || 1;
  const phase = (serverState && serverState.phase) || "Main";
  const turnNumber = (serverState && serverState.turnIndex) || 0;

  // Get avatar status
  const players = (serverState && serverState.players) || {};
  const p1 = players.p1 || {};
  const p2 = players.p2 || {};
  const lifeMy = me === "p1" ? Number(p1.life) || 0 : Number(p2.life) || 0;
  const lifeOpp = opp === "p1" ? Number(p1.life) || 0 : Number(p2.life) || 0;
  const atDeathsDoorMy = lifeMy <= 0;
  const atDeathsDoorOpp = lifeOpp <= 0;

  return {
    resources: {
      [me]: {
        manaAvailable: manaAvailableMy,
        manaSpent: manaSpentMy,
        sitesUntapped: sitesUntappedMy,
        sitesTapped: sitesTappedMy,
        providersUntapped: providersUntappedMy,
      },
      [opp]: {
        manaAvailable: manaAvailableOpp,
        manaSpent: manaSpentOpp,
        sitesUntapped: sitesUntappedOpp,
        sitesTapped: sitesTappedOpp,
        providersUntapped: providersUntappedOpp,
      },
    },
    thresholds: {
      [me]: thresholdsMy,
      [opp]: thresholdsOpp,
    },
    turnState: {
      currentPlayer,
      phase,
      turnNumber,
    },
    avatarStatus: {
      [me]: { life: lifeMy, atDeathsDoor: atDeathsDoorMy },
      [opp]: { life: lifeOpp, atDeathsDoor: atDeathsDoorOpp },
    },
  };
}

// T004: Board Development Feature - count permanents deployed
function extractBoardDevelopment(state, seat) {
  const myNum = seatNum(seat);
  const per = (state && state.permanents) || {};
  let count = 0;

  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      if (p && Number(p.owner) === myNum) {
        count++;
      }
    }
  }

  return count;
}

// T005: Mana Efficiency Feature - calculate efficiency and waste
function extractManaEfficiency(state, prevState, seat) {
  const stateModel = buildGameStateModel(state, seat);
  const myRes = stateModel.resources[seat];
  const manaAvailable = myRes.manaAvailable;
  const manaSpent = myRes.manaSpent;

  const spentRatio =
    manaAvailable > 0 ? manaSpent / Math.max(1, manaAvailable) : 0;
  const manaWasted = Math.max(0, manaAvailable - manaSpent);

  return {
    efficiency: spentRatio,
    wasted: manaWasted,
    available: manaAvailable,
    spent: manaSpent,
  };
}

// T006: Threat Deployment Feature - sum ATK of untapped units
function extractThreatDeployment(state, seat) {
  const myNum = seatNum(seat);
  const per = (state && state.permanents) || {};
  let totalAtk = 0;

  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      if (!p || Number(p.owner) !== myNum || p.tapped === true) continue;
      const atk = Number(p.card && p.card.attack) || 0;
      totalAtk += atk;
    }
  }

  return totalAtk;
}

// T007: Life Pressure Feature - damage potential against opponent
function extractLifePressure(state, seat) {
  const myNum = seatNum(seat);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _opp = otherSeat(seat);
  const oppAvatarPos = getOpponentAvatarPos(state, seat);
  const per = (state && state.permanents) || {};
  let pressure = 0;

  // Find units adjacent to opponent Avatar or opponent units
  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    const pos = parseCellKey(cellKey);
    if (!pos) continue;

    for (const p of arr) {
      if (!p || Number(p.owner) !== myNum || p.tapped === true) continue;

      const atk = Number(p.card && p.card.attack) || 0;
      if (atk === 0) continue;

      // Check if adjacent to opponent Avatar
      const distToAvatar = manhattan([pos.x, pos.y], oppAvatarPos);
      if (distToAvatar <= 1) {
        pressure += atk;
      }
    }
  }

  return pressure;
}

// T008: Anti-Pattern Penalties - detect degenerate behaviors
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractAntiPatterns(state, prevState, seat, candidateAction) {
  let penalty = 0;
  const ownedSites = countOwnedManaSites(state, seat);
  const stateModel = buildGameStateModel(state, seat);
  const manaAvailable = stateModel.resources[seat].manaAvailable;

  // Site spam penalty: sites >= 6 and playing another site
  if (ownedSites >= 6 && candidateAction === "play_site") {
    penalty += 2.0;
  }

  // Wasted resources penalty: mana >= 3, playable cards exist, but passing
  if (manaAvailable >= 3 && candidateAction === "pass") {
    const hand = getZones(state, seat).hand || [];
    const hasPlayableCards = hand.some((c) => canAffordCard(state, seat, c));
    if (hasPlayableCards) {
      penalty += 1.5;
    }
  }

  return penalty;
}

// T010/T061: Phase-Based Weight Modifiers - AGGRESSIVE strategy that builds toward opponent
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getStrategicModifiers(state, seat, _theta) {
  const stateModel = buildGameStateModel(state, seat);
  const turnNumber = stateModel.turnState.turnNumber;
  const ownedSites = countOwnedManaSites(state, seat);
  const boardDev = extractBoardDevelopment(state, seat);
  const opp = otherSeat(seat);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _oppLife = stateModel.avatarStatus[opp].life;
  const myLife = stateModel.avatarStatus[seat].life;
  const oppThreatDeploy = extractThreatDeployment(state, opp);

  const modifiers = {
    play_site: 1.0,
    play_unit: 1.0,
    play_minion: 1.0,
    play_magic: 1.0,
    play_aura: 1.0,
    play_artifact: 1.0,
    avatar_tap: 1.0,
    attack: 1.0,
    pass: 1.0,
    draw: 1.0,
  };

  // Phase 1: Establish initial mana base (turns 1-3, sites < 3)
  // Priority: Play sites aggressively, avoid drawing and attacking
  if (turnNumber <= 3 && ownedSites < 3) {
    modifiers.play_site = 3.0;    // MUST build mana base
    modifiers.play_unit = 0.3;    // Don't play units yet
    modifiers.play_minion = 0.3;
    modifiers.play_magic = 0.3;   // Too early for spells
    modifiers.play_aura = 0.1;    // Way too early for enchantments
    modifiers.play_artifact = 0.15;
    modifiers.avatar_tap = 0.8;   // Drawing a site is okay if no site in hand
    modifiers.attack = 0.3;       // Don't move/attack before establishing mana base
    modifiers.draw = 0.5;         // Discourage draw spam
  }

  // Phase 2: Expand toward opponent (sites 3-5)
  // Priority: Deploy minions AND continue site expansion
  else if (ownedSites >= 3 && ownedSites < 6) {
    modifiers.play_site = 2.5;    // Keep expanding
    modifiers.play_unit = 2.0;    // Deploy threats — minions are key
    modifiers.play_minion = 2.0;
    modifiers.play_magic = 1.2;   // Spells useful for removal
    modifiers.play_aura = 0.8;    // Auras starting to be viable
    modifiers.play_artifact = 0.9;
    modifiers.avatar_tap = 0.6;   // Prefer placing sites over drawing them
    modifiers.attack = 0.8;       // Prefer deploying units over attacking early
    modifiers.draw = 0.4;         // Discourage draw spam
  }

  // Phase 3: Deploy threats (sites >= 3, need board presence)
  // Priority: Play creatures aggressively — board presence is critical
  if (ownedSites >= 3 && boardDev < 3) {
    modifiers.play_minion = 2.5;  // Deploy creatures aggressively
    modifiers.play_unit = 2.5;
    modifiers.play_magic = 1.5;   // Removal/pump spells useful
    modifiers.play_aura = 1.8;    // Enchantments add ongoing value
    modifiers.play_artifact = 1.5;
    modifiers.play_site = 1.5;    // Keep expanding
    modifiers.avatar_tap = 0.5;
    modifiers.attack = 0.6;       // Don't attack until we have board presence
    modifiers.draw = 0.3;         // Heavily discourage draw spam
  }

  // Phase 4: Attack phase (developed board, enough sites)
  // Priority: BOTH attack AND keep deploying — never stop playing minions
  if (boardDev >= 2 && ownedSites >= 4) {
    modifiers.attack = 1.8;       // Attack with favorable trades
    modifiers.play_minion = 1.8;  // Keep deploying threats — always want more minions
    modifiers.play_unit = 1.8;
    modifiers.play_magic = 1.8;   // Removal spells to soften targets before attacking
    modifiers.play_aura = 1.2;    // Ongoing value
    modifiers.play_artifact = 1.2;
    modifiers.play_site = 1.8;    // Continue expansion
    modifiers.avatar_tap = 0.4;
    modifiers.draw = 0.2;         // Minimal drawing
  }

  // Override: Boost avatar_tap when no sites in hand (need to draw from atlas to keep expanding)
  const hand = getZones(state, seat).hand || [];
  const sitesInHand = hand.filter((c) => isSiteCard(c)).length;
  if (sitesInHand === 0 && ownedSites < 6) {
    modifiers.avatar_tap = Math.max(modifiers.avatar_tap, 2.0); // Need sites!
  }

  // Override: Defend against lethal threat
  if (oppThreatDeploy >= myLife && myLife > 0) {
    modifiers.play_unit = 2.5;    // Prioritize blockers
    modifiers.play_minion = 2.5;
    modifiers.play_magic = 2.0;   // Removal is critical
    modifiers.play_aura = 0.5;    // No time for enchantments
    modifiers.play_artifact = 0.5;
    modifiers.attack = 0.3;       // Don't attack when defending
    modifiers.avatar_tap = 0.2;
    modifiers.draw = 0.1;         // No time for drawing
  }

  return modifiers;
}

// =============================================================================
// DETERMINISTIC RULES MODULE (T100)
// These bypass scoring for obviously correct plays - Turn 1 is ALWAYS site
// =============================================================================

/**
 * Analyze threshold requirements for cards in hand
 * Returns what elements we're missing to play our cards
 */
function analyzeThresholdNeeds(state, seat) {
  const zones = getZones(state, seat);
  const hand = Array.isArray(zones.hand) ? zones.hand : [];

  // Get current thresholds
  const thresholds = countThresholdsForSeat(state, seat);
  const currentThresholds = {
    air: Number(thresholds.air || 0),
    water: Number(thresholds.water || 0),
    earth: Number(thresholds.earth || 0),
    fire: Number(thresholds.fire || 0),
  };

  const needs = { air: 0, water: 0, earth: 0, fire: 0 };
  const unplayableCards = [];

  for (const card of hand) {
    if (!card || isSiteCard(card)) continue;

    // Check threshold requirements
    const threshold = card.threshold || {};
    let canPlay = true;

    for (const [element, required] of Object.entries(threshold)) {
      const have = currentThresholds[element.toLowerCase()] || 0;
      const need = Number(required) || 0;
      if (need > have) {
        const missing = need - have;
        needs[element.toLowerCase()] = Math.max(
          needs[element.toLowerCase()] || 0,
          missing
        );
        canPlay = false;
      }
    }

    if (!canPlay) {
      unplayableCards.push(card.name);
    }
  }

  const hasMissingThresholds = Object.values(needs).some((v) => v > 0);
  const primaryNeed = Object.entries(needs)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    hasMissingThresholds,
    missingElements: needs,
    unplayableCards,
    currentThresholds,
    shouldDrawSite: hasMissingThresholds,
    primaryNeed,
  };
}

/**
 * Determine the best draw source based on current needs
 */
function selectDrawSource(state, seat) {
  const sites = countOwnedManaSites(state, seat);
  const stateModel = buildGameStateModel(state, seat);
  const turnNumber = stateModel.turnState.turnNumber;
  const thresholdAnalysis = analyzeThresholdNeeds(state, seat);

  // Rule 1: Turn 4 site draw rule - reach 4 mana for playability
  if (turnNumber === 4 && sites < 4) {
    return {
      source: "atlas",
      reason: "turn_4_mana_development",
    };
  }

  // Rule 2: Missing threshold for cards in hand
  if (thresholdAnalysis.hasMissingThresholds && sites < 6) {
    return {
      source: "atlas",
      reason: "fix_threshold",
    };
  }

  // Rule 3: Have enough mana, looking for action
  if (sites >= 4 && !thresholdAnalysis.hasMissingThresholds) {
    return {
      source: "spellbook",
      reason: "have_mana_need_action",
    };
  }

  // Rule 4: Default - prefer site until 5 mana
  if (sites < 5) {
    return {
      source: "atlas",
      reason: "mana_development",
    };
  }

  return {
    source: "spellbook",
    reason: "default_late_game",
  };
}

/**
 * Find a 1-cost creature that can be played
 */
function findPlayableOneCost(hand, state, seat) {
  for (const card of hand) {
    if (!card) continue;
    if (isSiteCard(card)) continue;

    const cost = Number(card.cost || card.manaCost || 0);
    if (cost !== 1) continue;
    if (!canAffordCard(state, seat, card)) continue;

    const cardType = (card.type || "").toLowerCase();
    if (
      cardType.includes("minion") ||
      cardType.includes("unit") ||
      cardType.includes("creature")
    ) {
      return card;
    }
  }
  return null;
}

/**
 * Check if hand has a site card
 */
function hasSiteInHand(hand) {
  return hand.some((c) => c && isSiteCard(c));
}

/**
 * Choose best site from hand based on threshold needs
 */
function chooseBestSiteFromHand(hand, thresholdNeeds) {
  const sites = hand.filter((c) => c && isSiteCard(c));
  if (sites.length === 0) return null;

  // If we have threshold needs, prefer sites that provide those elements
  if (thresholdNeeds && thresholdNeeds.primaryNeed) {
    const targetElement = thresholdNeeds.primaryNeed.toLowerCase();

    for (const site of sites) {
      const siteName = (site.name || "").toLowerCase();
      // Check if site name suggests it provides the needed element
      if (siteName.includes(targetElement)) {
        return site;
      }
      // Check for common naming patterns
      if (targetElement === "earth" && siteName.includes("valley")) return site;
      if (targetElement === "water" && siteName.includes("lake")) return site;
      if (targetElement === "fire" && siteName.includes("volcano")) return site;
      if (targetElement === "air" && siteName.includes("peak")) return site;
    }
  }

  return sites[0];
}

/**
 * Get deterministic action if one exists (T100)
 *
 * These are plays so obviously correct they bypass scoring:
 * - Turn 1: ALWAYS play site under avatar
 * - Turn 2: Play site unless 1-cost creature is playable
 * - Turn 3: Play site if < 3 sites
 *
 * Returns null if no deterministic action (fall through to scoring)
 */
function getDeterministicAction(state, seat) {
  const stateModel = buildGameStateModel(state, seat);
  const turnNumber = stateModel.turnState.turnNumber;
  const sites = countOwnedManaSites(state, seat);
  const zones = getZones(state, seat);
  const hand = Array.isArray(zones.hand) ? zones.hand : [];

  // Per rules p.20: Avatar must be untapped to play a site
  const avatarState = getAvatar(state, seat);
  const avatarTapped = !!(avatarState && avatarState.tapped);

  // TURN 1: ALWAYS play site under avatar (no exceptions) — if avatar untapped
  if (turnNumber === 1 && sites === 0 && !avatarTapped && hasSiteInHand(hand)) {
    console.log("[Bot Engine] T100: Turn 1 deterministic site play");
    const thresholdNeeds = analyzeThresholdNeeds(state, seat);
    const site = chooseBestSiteFromHand(hand, thresholdNeeds);
    if (site) {
      return {
        type: "play_site",
        card: site,
        reason: "turn_1_mandatory_site",
      };
    }
  }

  // TURN 2: Play site unless 1-cost creature is playable AND we have 1 site
  if (turnNumber === 2 && sites < 2 && !avatarTapped && hasSiteInHand(hand)) {
    const oneCost = findPlayableOneCost(hand, state, seat);

    // If we have a 1-cost and exactly 1 site, let scoring decide
    // Otherwise, play the site
    if (!oneCost) {
      console.log("[Bot Engine] T100: Turn 2 deterministic site play");
      const thresholdNeeds = analyzeThresholdNeeds(state, seat);
      const site = chooseBestSiteFromHand(hand, thresholdNeeds);
      if (site) {
        return {
          type: "play_site",
          card: site,
          reason: "turn_2_continue_mana",
        };
      }
    }
  }

  // TURN 3: Play site if < 3 sites (need 3 mana base)
  if (turnNumber === 3 && sites < 3 && !avatarTapped && hasSiteInHand(hand)) {
    console.log(`[Bot Engine] T100: Turn 3 deterministic site play (${sites} sites)`);
    const thresholdNeeds = analyzeThresholdNeeds(state, seat);
    const site = chooseBestSiteFromHand(hand, thresholdNeeds);
    if (site) {
      return {
        type: "play_site",
        card: site,
        reason: "turn_3_reach_3_mana",
      };
    }
  }

  // No deterministic action - use scoring
  return null;
}

/**
 * Convert deterministic action to a patch
 */
function createPatchFromDeterministicAction(action, state, seat) {
  if (!action) return null;

  if (action.type === "play_site") {
    // Use the existing playSitePatch but try to use the specific card
    const patch = playSitePatch(state, seat);
    if (patch) {
      // Log the deterministic decision
      console.log(
        `[Bot Engine] T100: Deterministic action: ${action.reason}`
      );
    }
    return patch;
  }

  return null;
}

/**
 * Score attack targets with proper priority (T101)
 *
 * Priority order:
 * 1. Lethal on avatar (100+ points)
 * 2. Undefended sites (8-10 points) - mana denial is huge
 * 3. Defended sites (5-7 points)
 * 4. Units blocking avatar path (3-5 points)
 * 5. Direct avatar damage (1-3 points)
 */
function scoreAttackTarget(attacker, target, state, seat) {
  let score = 0;
  const stateModel = buildGameStateModel(state, seat);
  const turnNumber = stateModel.turnState.turnNumber;
  const attackerAtk = Number(attacker.card?.attack || attacker.attack || 0);

  if (target.type === "site") {
    score += 6.0; // Base site value - mana denial

    // Early game site destruction compounds
    if (turnNumber <= 6) {
      score += 2.5;
    }
  }

  if (target.type === "unit" || target.type === "minion") {
    score += 2.0;
  }

  if (target.type === "avatar") {
    const targetLife = Number(target.life || 20);
    if (attackerAtk >= targetLife) {
      score += 100.0; // ALWAYS take lethal
    } else {
      score += 1.0 + attackerAtk * 0.2;
    }
  }

  return score;
}

// =============================================================================
// END DETERMINISTIC RULES MODULE
// =============================================================================

function extractFeatures(prevState, nextState, seat) {
  const me = seat;
  const opp = otherSeat(seat);
  const players = (nextState && nextState.players) || {};
  const p1 = players.p1 || {};
  const p2 = players.p2 || {};
  const lifeMy =
    me === "p1" ? Number(p1.life || 0) || 0 : Number(p2.life || 0) || 0;
  const lifeOpp =
    me === "p1" ? Number(p2.life || 0) || 0 : Number(p1.life || 0) || 0;
  const zMy = getZones(nextState, me);
  const zOpp = getZones(nextState, opp);
  const handMy = Array.isArray(zMy.hand) ? zMy.hand.length : 0;
  const handOpp = Array.isArray(zOpp.hand) ? zOpp.hand.length : 0;
  const per = (nextState && nextState.permanents) || {};
  let tMy = 0;
  let tOpp = 0;
  for (const k of Object.keys(per)) {
    const arr = Array.isArray(per[k]) ? per[k] : [];
    for (const p of arr) {
      if (Number(p.owner) === seatNum(me)) tMy++;
      else if (Number(p.owner) === seatNum(opp)) tOpp++;
    }
  }
  const meKey = me;
  const prevSpent =
    (prevState &&
      prevState.resources &&
      prevState.resources[meKey] &&
      Number(prevState.resources[meKey].spentThisTurn)) ||
    0;
  const nextSpent =
    (nextState &&
      nextState.resources &&
      nextState.resources[meKey] &&
      Number(nextState.resources[meKey].spentThisTurn)) ||
    0;
  const available =
    countOwnedManaSites(nextState, me) +
    countManaProvidersFromPermanents(nextState, me);
  const spentInc = Math.max(0, nextSpent - prevSpent);
  const onCurve =
    available > 0 ? Math.min(1, spentInc / Math.max(1, available)) : 0;
  const manaWasted = Math.max(0, available - nextSpent);
  const sitesMy = (() => {
    let n = 0;
    const s = (nextState && nextState.board && nextState.board.sites) || {};
    for (const k of Object.keys(s)) {
      const t = s[k];
      if (t && t.card && Number(t.owner) === seatNum(me)) n++;
    }
    return n;
  })();
  const sitesOpp = (() => {
    let n = 0;
    const s = (nextState && nextState.board && nextState.board.sites) || {};
    for (const k of Object.keys(s)) {
      const t = s[k];
      if (t && t.card && Number(t.owner) === seatNum(opp)) n++;
    }
    return n;
  })();
  const providersMy = countManaProvidersFromPermanents(nextState, me);
  const providersOpp = countManaProvidersFromPermanents(nextState, opp);
  const thMy = countThresholdsForSeat(nextState, me);
  const thOpp = countThresholdsForSeat(nextState, opp);
  const thTotMy =
    (thMy.air || 0) + (thMy.water || 0) + (thMy.earth || 0) + (thMy.fire || 0);
  const thTotOpp =
    (thOpp.air || 0) +
    (thOpp.water || 0) +
    (thOpp.earth || 0) +
    (thOpp.fire || 0);
  // Advancement: closer average distance of my units to opponent avatar
  const oppPos = getAvatarPos(nextState, opp);
  let myCount = 0;
  let distSum = 0;
  for (const key of Object.keys(per)) {
    const arr = Array.isArray(per[key]) ? per[key] : [];
    const p = parseCellKey(key);
    if (!p) continue;
    for (const it of arr) {
      try {
        if (Number(it.owner) === seatNum(me)) {
          myCount++;
          distSum += manhattan([p.x, p.y], oppPos);
        }
      } catch {}
    }
  }
  const advance = myCount > 0 ? -(distSum / myCount) : 0;

  // T009: Add new evaluation features
  const boardDevelopment = extractBoardDevelopment(nextState, me);
  const manaEfficiency = extractManaEfficiency(nextState, prevState, me);
  const threatDeployment = extractThreatDeployment(nextState, me);
  const lifePressure = extractLifePressure(nextState, me);
  const winCond = detectWinCondition(nextState, me);

  return {
    life_my: lifeMy,
    life_opp: lifeOpp,
    hand_my: handMy,
    hand_opp: handOpp,
    threats_my: tMy,
    threats_opp: tOpp,
    atk_my: 0,
    atk_opp: 0,
    hp_my: 0,
    hp_opp: 0,
    mana_avail: available,
    mana_wasted: manaWasted,
    on_curve: onCurve,
    lethal_now: winCond.canDealLethal ? 1 : 0,
    opp_lethal_next: 0,
    removal_in_hand: 0,
    engines_online: 0,
    sweeper_risk: 0,
    sites_my: sitesMy,
    sites_opp: sitesOpp,
    providers_my: providersMy,
    providers_opp: providersOpp,
    th_total_my: thTotMy,
    th_total_opp: thTotOpp,
    advance,
    // New features
    board_development: boardDevelopment,
    mana_efficiency: manaEfficiency.efficiency,
    mana_efficiency_wasted: manaEfficiency.wasted,
    threat_deployment: threatDeployment,
    life_pressure: lifePressure,
  };
}

// T009: Updated evaluation function with new features
function evalFeatures(f, w) {
  let s = 0;

  // Existing features
  s += (w.w_life || 0) * (f.life_my - f.life_opp);
  s += (w.w_atk || 0) * (f.atk_my - f.atk_opp);
  s += (w.w_hp || 0) * (f.hp_my - f.hp_opp);
  s += (w.w_hand || 0) * (f.hand_my - f.hand_opp);
  s +=
    (w.w_threats_my || 0) * f.threats_my +
    (w.w_threats_opp || 0) * f.threats_opp;
  s += (w.w_mana_waste || 0) * f.mana_wasted;
  s += (w.w_mana_avail || 0) * f.mana_avail;
  s += (w.w_sites || 0) * (f.sites_my - f.sites_opp);
  s += (w.w_providers || 0) * (f.providers_my - f.providers_opp);
  s += (w.w_thresholds_total || 0) * (f.th_total_my - f.th_total_opp);
  s += (w.w_on_curve || 0) * f.on_curve;
  s +=
    (w.w_lethal_now || 0) * f.lethal_now +
    (w.w_opp_lethal_next || 0) * f.opp_lethal_next;
  s +=
    (w.w_engine_online || 0) * f.engines_online +
    (w.w_sweeper_risk || 0) * f.sweeper_risk;
  s += (w.w_action_count_penalty || 0) * 0;
  s += (w.w_advance || 0) * (f.advance || 0);

  // New features (T004-T007)
  s += (w.w_board_development || 0) * (f.board_development || 0);
  s += (w.w_mana_efficiency || 0) * (f.mana_efficiency || 0);
  s += (w.w_mana_efficiency_waste || 0) * (f.mana_efficiency_wasted || 0);
  s += (w.w_threat_deployment || 0) * (f.threat_deployment || 0);
  s += (w.w_life_pressure || 0) * (f.life_pressure || 0);

  if (Number.isFinite(s) === false) s = 0;
  return s;
}

// T015: Evaluation breakdown for telemetry
function evalFeaturesWithBreakdown(f, w) {
  const breakdown = {};
  breakdown.life = (w.w_life || 0) * (f.life_my - f.life_opp);
  breakdown.atk = (w.w_atk || 0) * (f.atk_my - f.atk_opp);
  breakdown.hp = (w.w_hp || 0) * (f.hp_my - f.hp_opp);
  breakdown.hand = (w.w_hand || 0) * (f.hand_my - f.hand_opp);
  breakdown.threats =
    (w.w_threats_my || 0) * f.threats_my +
    (w.w_threats_opp || 0) * f.threats_opp;
  breakdown.mana_waste = (w.w_mana_waste || 0) * f.mana_wasted;
  breakdown.mana_avail = (w.w_mana_avail || 0) * f.mana_avail;
  breakdown.sites = (w.w_sites || 0) * (f.sites_my - f.sites_opp);
  breakdown.providers =
    (w.w_providers || 0) * (f.providers_my - f.providers_opp);
  breakdown.thresholds =
    (w.w_thresholds_total || 0) * (f.th_total_my - f.th_total_opp);
  breakdown.on_curve = (w.w_on_curve || 0) * f.on_curve;
  breakdown.lethal =
    (w.w_lethal_now || 0) * f.lethal_now +
    (w.w_opp_lethal_next || 0) * f.opp_lethal_next;
  breakdown.engines = (w.w_engine_online || 0) * f.engines_online;
  breakdown.sweeper_risk = (w.w_sweeper_risk || 0) * f.sweeper_risk;
  breakdown.advance = (w.w_advance || 0) * (f.advance || 0);
  breakdown.board_development =
    (w.w_board_development || 0) * (f.board_development || 0);
  breakdown.mana_efficiency =
    (w.w_mana_efficiency || 0) * (f.mana_efficiency || 0);
  breakdown.mana_efficiency_waste =
    (w.w_mana_efficiency_waste || 0) * (f.mana_efficiency_wasted || 0);
  breakdown.threat_deployment =
    (w.w_threat_deployment || 0) * (f.threat_deployment || 0);
  breakdown.life_pressure = (w.w_life_pressure || 0) * (f.life_pressure || 0);

  let total = 0;
  for (const key of Object.keys(breakdown)) {
    if (Number.isFinite(breakdown[key])) total += breakdown[key];
  }
  if (!Number.isFinite(total)) total = 0;

  return { breakdown, total };
}

// =============================================================================
// TYPE-SPECIFIC CARD EVALUATORS
// Each card type gets its own evaluation function that considers game context
// =============================================================================

/**
 * Evaluate playing a site card in the current context.
 * Considers: threshold contribution, element diversity, diminishing returns.
 * @param {object} state - Game state
 * @param {string} seat - Player seat
 * @param {object} card - Site card being evaluated
 * @returns {number} Score adjustment for this site play
 */
function evaluateSiteCandidate(state, seat) {
  const ownedSites = countOwnedManaSites(state, seat);
  const thresholds = countThresholdsForSeat(state, seat);
  const hand = (getZones(state, seat).hand || []);
  let score = 0;

  // Base value: sites are critical early, less so late
  if (ownedSites < 3) {
    score += 4.0; // Critical mana development
  } else if (ownedSites < 5) {
    score += 2.5; // Good expansion
  } else if (ownedSites < 7) {
    score += 1.0; // Moderate value
  } else {
    score -= 1.5; // Diminishing returns
  }

  // Threshold contribution: check if hand cards need elements we don't have
  const currentElements = {
    air: thresholds.air || 0,
    water: thresholds.water || 0,
    earth: thresholds.earth || 0,
    fire: thresholds.fire || 0,
  };

  // Count how many hand cards we can't play due to threshold
  let unplayableFromThreshold = 0;
  for (const c of hand) {
    if (!c || !c.thresholds) continue;
    const ct = c.thresholds;
    if ((ct.air || 0) > currentElements.air ||
        (ct.water || 0) > currentElements.water ||
        (ct.earth || 0) > currentElements.earth ||
        (ct.fire || 0) > currentElements.fire) {
      unplayableFromThreshold++;
    }
  }

  // Bonus for fixing threshold issues
  if (unplayableFromThreshold > 0) {
    score += Math.min(unplayableFromThreshold * 1.5, 4.0);
  }

  // Element diversity bonus
  const elementCount = Object.values(currentElements).filter(v => v > 0).length;
  if (elementCount < 2) score += 1.5; // Need more element types
  if (elementCount < 3) score += 0.5;

  return score;
}

/**
 * Evaluate playing a minion/creature in the current context.
 * Considers: stats efficiency, keywords, board state, mana curve.
 */
function evaluateMinionCandidate(state, seat, card) {
  let score = 0;
  const atk = Number(card.attack) || 0;
  const def = Number(card.defence || card.defense) || 0;
  const cost = Number(card.cost || card.manaCost || card.generic) || 1;
  const ownedSites = countOwnedManaSites(state, seat);
  const boardDev = extractBoardDevelopment(state, seat);
  const opp = otherSeat(seat);
  const oppThreat = extractThreatDeployment(state, opp);
  const stateModel = buildGameStateModel(state, seat);
  const myLife = stateModel.avatarStatus[seat].life;

  // Stats efficiency: (attack + defence) / cost
  const efficiency = (atk + def) / Math.max(cost, 1);
  score += efficiency * 1.2;

  // Raw power bonus for high-stat cards
  if (atk >= 4) score += 1.0;
  if (atk >= 6) score += 1.5;
  if (def >= 4) score += 0.5;

  // Keyword bonuses (from loader)
  if (cardEvalLoader) {
    score += cardEvalLoader.getKeywordBonuses(card);
  }

  // On-curve bonus: playing a card that matches our available mana
  const manaAvail = countUntappedMana(state, seat);
  if (cost === manaAvail || cost === manaAvail - 1) {
    score += 1.5; // On curve
  }

  // Board state context
  if (oppThreat >= myLife && myLife > 0) {
    // Defensive: value defence more
    score += def * 0.8;
    if (def >= atk) score += 1.0; // Good blocker
  } else if (boardDev >= 2 && ownedSites >= 4) {
    // Offensive: value attack more
    score += atk * 0.5;
  }

  // Winrate/power tier bonus
  if (cardEvalLoader) {
    score += cardEvalLoader.getWinrateBonus(card.name || "");
  }

  // Resolver bonus for minions with ETB/triggered abilities
  if (cardEvalLoader && cardEvalLoader.getResolverBonus) {
    score += cardEvalLoader.getResolverBonus(card.name || "");
  }

  return score;
}

/**
 * Evaluate casting a magic spell (instant/sorcery).
 * Considers: target availability, card advantage, tempo impact.
 */
function evaluateMagicCandidate(state, seat, card) {
  let score = 0;
  const cost = Number(card.cost || card.manaCost || card.generic) || 0;
  const opp = otherSeat(seat);
  const oppBoardDev = extractBoardDevelopment(state, opp);
  const myBoardDev = extractBoardDevelopment(state, seat);
  const rulesText = String(card.text || card.rulesText || "").toLowerCase();

  // Base value for casting a spell
  score += 2.0;

  // Removal spells: more valuable when opponent has board presence
  if (rulesText.includes("destroy") || rulesText.includes("damage") ||
      rulesText.includes("banish") || rulesText.includes("disable")) {
    score += Math.min(oppBoardDev * 1.0, 4.0);
    if (oppBoardDev === 0) score -= 2.0; // No targets
  }

  // Draw spells: value based on hand size and game state
  if (rulesText.includes("draw")) {
    const handSize = (getZones(state, seat).hand || []).length;
    score += handSize < 3 ? 3.0 : 1.0;
  }

  // Pump/buff spells: need units to buff
  if (rulesText.includes("+") && (rulesText.includes("atk") || rulesText.includes("attack"))) {
    score += myBoardDev > 0 ? 2.0 : -1.0;
  }

  // Mana efficiency: cheap spells are tempo-positive
  if (cost <= 2) score += 1.0;
  if (cost >= 5) score -= 0.5;

  // Winrate bonus
  if (cardEvalLoader) {
    score += cardEvalLoader.getWinrateBonus(card.name || "");
  }

  // Resolver bonus for spells with custom interactive effects
  if (cardEvalLoader && cardEvalLoader.getResolverBonus) {
    score += cardEvalLoader.getResolverBonus(card.name || "");
  }

  return score;
}

/**
 * Evaluate playing an aura (enchantment).
 * Considers: board presence, ongoing value, vulnerability.
 */
function evaluateAuraCandidate(state, seat, card) {
  let score = 0;
  const boardDev = extractBoardDevelopment(state, seat);
  const ownedSites = countOwnedManaSites(state, seat);
  const rulesText = String(card.text || card.rulesText || "").toLowerCase();

  // Auras need board presence to be effective
  if (boardDev === 0) {
    score -= 2.0; // No units to benefit
  } else {
    score += Math.min(boardDev * 0.8, 3.0); // More units = more value
  }

  // Ongoing value: auras that generate value each turn
  if (rulesText.includes("genesis") || rulesText.includes("each turn") ||
      rulesText.includes("whenever") || rulesText.includes("start of")) {
    score += 2.5; // Recurring value
  }

  // Need mana base established before investing in auras
  if (ownedSites < 3) {
    score -= 2.0; // Too early for enchantments
  } else if (ownedSites >= 5) {
    score += 1.0; // Good timing
  }

  // Winrate bonus
  if (cardEvalLoader) {
    score += cardEvalLoader.getWinrateBonus(card.name || "");
  }

  return score;
}

/**
 * Evaluate playing an artifact.
 * Considers: equipment targets, persistent value.
 */
function evaluateArtifactCandidate(state, seat, card) {
  let score = 0;
  const boardDev = extractBoardDevelopment(state, seat);
  const ownedSites = countOwnedManaSites(state, seat);
  const rulesText = String(card.text || card.rulesText || "").toLowerCase();

  // Base artifact value
  score += 1.5;

  // Equipment: needs units to equip
  if (rulesText.includes("equip") || rulesText.includes("attach")) {
    score += boardDev > 0 ? 2.0 : -1.5;
  }

  // Mana-producing artifacts are valuable early
  if (rulesText.includes("mana") || rulesText.includes("untap")) {
    score += ownedSites < 4 ? 3.0 : 1.0;
  }

  // Persistent value
  if (rulesText.includes("each turn") || rulesText.includes("whenever")) {
    score += 2.0;
  }

  // Winrate bonus
  if (cardEvalLoader) {
    score += cardEvalLoader.getWinrateBonus(card.name || "");
  }

  return score;
}

/**
 * Get type-specific evaluation for a card being played.
 * Routes to the appropriate evaluator based on card type.
 * @param {object} state - Game state
 * @param {string} seat - Player seat
 * @param {object} card - Card being played
 * @returns {number} Type-specific score adjustment
 */
function evaluateCardByType(state, seat, card) {
  const cardType = getCardTypeFromCard(card);
  switch (cardType) {
    case "site":     return evaluateSiteCandidate(state, seat, card);
    case "minion":   return evaluateMinionCandidate(state, seat, card);
    case "magic":    return evaluateMagicCandidate(state, seat, card);
    case "aura":     return evaluateAuraCandidate(state, seat, card);
    case "artifact": return evaluateArtifactCandidate(state, seat, card);
    default:         return 0;
  }
}

// T011: Helper to determine action type from patch
function getActionType(patch) {
  try {
    if (!patch || typeof patch !== "object") return "pass";

    // Check for avatar tap alternative (draw site to hand)
    if (patch._avatarTap) return "avatar_tap";

    // Check for site playing FIRST (site patches also tap avatar, so check before avatar movement)
    if (patch.board && patch.board.sites) {
      const keys = Object.keys(patch.board.sites);
      if (keys.length > 0) return "play_site";
    }

    // Check for avatar movement (avatars key with tapped: true and a position change)
    if (patch.avatars && typeof patch.avatars === "object") {
      const avatarSeats = Object.keys(patch.avatars);
      for (const s of avatarSeats) {
        if (patch.avatars[s] && patch.avatars[s].tapped === true && patch.avatars[s].pos) {
          return "attack"; // Avatar movement/attack
        }
      }
    }

    // Check for unit/minion/aura/artifact playing - type-specific detection
    if (patch.permanents) {
      const cells = Object.keys(patch.permanents);
      for (const cell of cells) {
        const arr = Array.isArray(patch.permanents[cell])
          ? patch.permanents[cell]
          : [];
        if (arr.length > 0) {
          // Check if this is a movement (tapped: true) or a play (tapped: false)
          const newPerm = arr.find(
            (p) => p && p.card && p.tapped === false
          );
          if (newPerm) {
            // Determine specific card type
            const cardType = getCardTypeFromCard(newPerm.card);
            if (cardType === "aura") return "play_aura";
            if (cardType === "artifact") return "play_artifact";
            if (cardType === "magic") return "play_magic";
            return "play_minion";
          }
        }
      }
      // If we have permanents array changes but no new untapped units, it's movement (attack)
      return "attack";
    }

    // Check for zone changes (draw or magic spell cast)
    if (patch.zones && typeof patch.zones === "object") {
      const seats = Object.keys(patch.zones);
      if (seats.length > 0) {
        const z = patch.zones[seats[0]];
        if (
          z &&
          typeof z === "object" &&
          Object.prototype.hasOwnProperty.call(z, "hand")
        ) {
          // Magic spells: only zones change, no permanents, and _spellCast marker
          // We tag spell patches with _spellCast in playSpellPatch
          if (patch._spellCast) {
            return "play_magic";
          }
          return "draw";
        }
      }
    }

    return "pass";
  } catch {
    return "pass";
  }
}

// Helper to classify card type from card object
// Falls back to cards_raw.json lookup via cardEvalLoader if card.type is missing
function getCardTypeFromCard(card) {
  if (!card) return "minion";
  // Use cardEvalLoader.getCardType which has cards_raw.json fallback
  if (cardEvalLoader && typeof cardEvalLoader.getCardType === "function") {
    const ct = cardEvalLoader.getCardType(card);
    if (ct && ct !== "unknown") return ct;
  }
  // Inline fallback if loader not available
  if (!card.type) return "minion";
  const t = String(card.type).toLowerCase();
  if (t.includes("site")) return "site";
  if (t.includes("avatar")) return "avatar";
  if (t.includes("aura") || t.includes("enchantment")) return "aura";
  if (t.includes("artifact") || t.includes("relic") || t.includes("equipment")) return "artifact";
  if (t.includes("magic") || t.includes("sorcery")) return "magic";
  return "minion";
}

// T036: Helper to extract card being played from patch
function getCardFromPatch(patch) {
  try {
    if (!patch || typeof patch !== "object") return null;

    // Check for site being played
    if (patch.board && patch.board.sites) {
      const keys = Object.keys(patch.board.sites);
      for (const key of keys) {
        const tile = patch.board.sites[key];
        if (tile && tile.card) return tile.card;
      }
    }

    // Check for spell cast (magic/sorcery with _spellCard marker)
    if (patch._spellCard) {
      return patch._spellCard;
    }

    // Check for unit/permanent being played
    if (patch.permanents) {
      const cells = Object.keys(patch.permanents);
      for (const cell of cells) {
        const arr = Array.isArray(patch.permanents[cell])
          ? patch.permanents[cell]
          : [];
        for (const p of arr) {
          // Only return newly played cards (not tapped, which indicates movement)
          if (p && p.card && p.tapped === false) {
            return p.card;
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// T012-T014: Refined candidate generation with cost validation and prioritization
// T015: Enhanced to track filtering stats for telemetry
function generateCandidates(state, seat, options = {}) {
  const base = deepClone(state || {});
  const moves = [];
  const skipDraw = options && options.skipDrawThisTurn === true;
  const ownedSitesNow = countOwnedManaSites(base, seat);
  const hand = getZones(base, seat).hand || [];

  // T015: Track filtering stats
  const stats = {
    totalUnitsInHand: 0,
    filteredUnaffordable: 0,
    playableUnits: 0,
    totalSpellsInHand: 0,
    playableSpells: 0,
    sitesGated: false,
    candidatesGenerated: 0,
  };

  function mergeTwo(a, b) {
    return mergeReplaceArrays(a || {}, b || {});
  }
  function seq(arr) {
    let p = {};
    for (const part of arr) if (part) p = mergeTwo(p, part);
    return p;
  }

  // T012: Filter playable units by cost/threshold validation
  // Exclude sites AND avatars (avatars are part of setup, cannot be played from hand)
  const allUnits = hand.filter((c) => {
    const cardType = (c.type || "").toLowerCase();
    if (cardType.includes("site")) return false;
    if (cardType.includes("avatar")) return false; // CRITICAL: avatars can't be played
    if (isSpellCard(c)) return false; // T043: Exclude spells from units
    return true;
  });
  stats.totalUnitsInHand = allUnits.length;

  const playableUnits = allUnits
    .filter((c) => {
      const affordable = canAffordCard(base, seat, c);
      if (!affordable) stats.filteredUnaffordable++;
      return affordable;
    })
    .slice(0, 8); // Limit to 8 playable units
  stats.playableUnits = playableUnits.length;

  // T043: Filter playable spells (Magic/Sorcery/Aura)
  const allSpells = hand.filter((c) => isSpellCard(c));
  stats.totalSpellsInHand = allSpells.length;

  const playableSpells = allSpells
    .filter((c) => canAffordCard(base, seat, c))
    .slice(0, 6);
  stats.playableSpells = playableSpells.length;

  // Diagnostic: log candidate generation summary
  try {
    const mana = countUntappedMana(base, seat);
    const res = (base && base.resources && base.resources[seat]) || {};
    const spent = Number(res.spentThisTurn) || 0;
    console.log(`[Engine] Candidates: ${playableUnits.length} units (${allUnits.length} total), ${playableSpells.length} spells, sites=${ownedSitesNow}, mana=${mana}, spent=${spent}, hand=${hand.length}`);
    if (playableUnits.length > 0) {
      console.log(`[Engine] Playable units:`, playableUnits.map(u => `${u.name || '?'}(cost=${getCardManaCost(u)})`).join(', '));
    }
  } catch {}

  // Draw patches
  const drawSpell = skipDraw
    ? null
    : drawFromPilePatch(base, seat, "spellbook");
  const drawAtlas = skipDraw ? null : drawFromAtlasPatch(base, seat);
  const pass = {};

  // T012: Prioritize unit-playing candidates FIRST - pass specific cards
  if (playableUnits.length > 0) {
    for (const unit of playableUnits) {
      const unitPatch = playUnitPatch(base, seat, null, unit); // Pass specific card
      if (unitPatch) moves.push(seq([unitPatch]));
    }
    // Also try unit after draw
    if (drawSpell) {
      const afterDraw = applyPatch(base, drawSpell);
      // Re-check affordability after draw (hand changed)
      const newHand = getZones(afterDraw, seat).hand || [];
      const affordableAfterDraw = newHand
        .filter((c) => {
          const cardType = (c.type || "").toLowerCase();
          if (cardType.includes("site")) return false;
          if (cardType.includes("avatar")) return false; // CRITICAL: avatars can't be played
          if (isSpellCard(c)) return false; // Exclude spells
          return canAffordCard(afterDraw, seat, c);
        })
        .slice(0, 3); // Limit to 3 after draw

      for (const unit of affordableAfterDraw) {
        const unitAfterDraw = playUnitPatch(afterDraw, seat, null, unit);
        if (unitAfterDraw) moves.push(seq([drawSpell, unitAfterDraw]));
      }
    }
  }

  // T043: Spell-playing candidates - generate for Magic/Sorcery/Aura cards
  if (playableSpells.length > 0) {
    for (const spell of playableSpells) {
      const spellPatch = playSpellPatch(base, seat, spell);
      if (spellPatch) moves.push(seq([spellPatch]));
    }
    // Also try spell after draw (combos)
    if (drawSpell) {
      const afterDraw = applyPatch(base, drawSpell);
      const newHand = getZones(afterDraw, seat).hand || [];
      const affordableSpellsAfterDraw = newHand
        .filter((c) => {
          if (!isSpellCard(c)) return false;
          return canAffordCard(afterDraw, seat, c);
        })
        .slice(0, 2); // Limit to 2 spells after draw

      for (const spell of affordableSpellsAfterDraw) {
        const spellAfterDraw = playSpellPatch(afterDraw, seat, spell);
        if (spellAfterDraw) moves.push(seq([drawSpell, spellAfterDraw]));
      }
    }
  }

  // Movement candidates (up to 4)
  const movePatches = generateMoveCandidates(base, seat);
  for (let i = 0; i < Math.min(4, movePatches.length); i++) {
    moves.push(seq([movePatches[i]]));
  }

  // Per rules p.20: "Tap → Play or draw a site" — Avatar must be untapped to play a site
  const avatarState = getAvatar(base, seat);
  const avatarTapped = !!(avatarState && avatarState.tapped);
  // T013/T076: Allow site playing up to 8 sites, BUT only if avatar is untapped
  const allowSitePlaying = ownedSitesNow < 8 && !avatarTapped;
  stats.sitesGated = !allowSitePlaying;

  if (allowSitePlaying) {
    const sitePatch = playSitePatch(base, seat);
    if (sitePatch) {
      moves.push(seq([sitePatch]));
    }

    // Avatar tap alternative: draw a site to hand instead of placing one
    // This is valuable when: no sites in hand, or we want to save sites for later
    const avatarTapDraw = drawFromAtlasWithTapPatch(base, seat);
    if (avatarTapDraw) {
      // Tag it so getActionType recognizes it as avatar_tap
      avatarTapDraw._avatarTap = true;
      moves.push(seq([avatarTapDraw]));
    }
  }

  // T076/T078/T100: Draw candidates
  // In Sorcery: Main phase draws from atlas require tapping avatar (handled above in site section)
  // Spellbook draw happens at Start phase (handled in headless-bot-client.js)
  // Only generate standalone spellbook draw as fallback when nothing else to do and hand is small
  const sitesInHand = hand.filter((c) => isSiteCard(c)).length;
  const hasSiteToPlay =
    allowSitePlaying && ownedSitesNow < 8 && sitesInHand > 0;
  const handSize = getZones(base, seat).hand?.length || 0;
  const hasPlayableActions =
    playableUnits.length > 0 || playableSpells.length > 0 || hasSiteToPlay;

  // Only offer spellbook draw as standalone action when hand is very small and nothing to play
  if (handSize < 4 && !hasPlayableActions && drawSpell) {
    moves.push(seq([drawSpell]));
  }

  // Pass candidate (always include)
  const passCand = seq([pass]);
  moves.push(passCand);

  // T014: Limit branching factor to 16, but always keep the pass candidate
  stats.candidatesGenerated = moves.length;
  let limited;
  if (moves.length <= 16) {
    limited = moves;
  } else {
    // Take first 15 action candidates + always include pass
    limited = moves.slice(0, 15);
    limited.push(passCand);
  }

  // T015: Attach stats for telemetry
  if (options && options.collectStats) {
    return { candidates: limited, stats };
  }
  return limited;
}

function search(state, seat, theta, rng, options) {
  const start = Date.now();
  const thetaUse = theta && theta.weights ? theta : loadTheta();
  const w = (thetaUse && thetaUse.weights) || {};
  const conf = (thetaUse && thetaUse.search) || {};
  const beamWidth = Number(conf.beamWidth || 8) || 8;
  const maxDepth = Math.max(1, Number(conf.maxDepth || 2) || 2);
  const budgetMs = Math.max(1, Number(conf.budgetMs || 60) || 60);
  const gamma = typeof conf.gamma === "number" ? conf.gamma : 0.6;
  const softDeadline = start + Math.floor(budgetMs * 2); // soft budget, never hard-fail

  // T100: Check for deterministic actions FIRST (bypass scoring for obvious plays)
  const deterministicAction = getDeterministicAction(state, seat);
  if (deterministicAction) {
    const patch = createPatchFromDeterministicAction(deterministicAction, state, seat);
    if (patch) {
      // Log deterministic decision if telemetry enabled
      if (options && typeof options.logger === "function") {
        options.logger({
          mode: options.mode || "evaluate",
          deterministic: true,
          deterministicReason: deterministicAction.reason,
          timeMs: Date.now() - start,
          t: Date.now(),
        });
      }
      return patch;
    }
  }

  // T015: Collect generation stats for telemetry
  const collectStats = options && typeof options.logger === "function";
  const genResult = generateCandidates(state, seat, {
    ...options,
    collectStats,
  });
  const list = collectStats ? genResult.candidates : genResult;
  const generationStats = collectStats ? genResult.stats : null;

  // T011: Get strategic modifiers for phase-based strategy
  const strategicModifiers = getStrategicModifiers(state, seat, thetaUse);

  const scored = [];
  for (const p of list) {
    const next = applyPatch(state, p);
    const f = extractFeatures(state, next, seat);
    let s = evalFeatures(f, w);

    // T011: Apply strategic modifier based on action type
    const actionType = getActionType(p);
    const modifier = strategicModifiers[actionType] || 1.0;
    s = s * modifier;

    // Type-specific card evaluation (replaces flat T036 bonus)
    let cardBonus = 0;
    let cardName = null;
    try {
      const card = getCardFromPatch(p);
      if (card && card.name) {
        cardName = card.name;
        const cardWeight = w.w_card_specific || 1.0;

        // Layer 1: Type-specific evaluator (Site, Minion, Magic, Aura, Artifact)
        const typeScore = evaluateCardByType(state, seat, card);

        // Layer 2: LLM contextual evaluation (if available)
        let llmScore = 0;
        if (cardEvalCache && cardEvalLoader) {
          const context = cardEvalLoader.buildEvaluationContext(
            state,
            seat,
            card
          );
          const llmResult = cardEvalLoader.evaluateCard(card.name, context);
          if (llmResult !== null) {
            llmScore = llmResult;
          }
        }

        // Layer 3: Winrate-based bonus from production data
        let winrateBonus = 0;
        if (cardEvalLoader) {
          winrateBonus = cardEvalLoader.getWinrateBonus(card.name);
        }

        // Layer 4: Resolver bonus for cards with custom interactive effects
        let resolverBonus = 0;
        if (cardEvalLoader && cardEvalLoader.getResolverBonus) {
          resolverBonus = cardEvalLoader.getResolverBonus(card.name);
        }

        // Combined card bonus: all signals weighted together
        cardBonus = (typeScore + llmScore + winrateBonus + resolverBonus) * cardWeight;
        s = s + cardBonus;
      }
    } catch {
      // Silently fall back to generic evaluation if card evaluation fails
    }

    // Attack/movement bonus: compensate for lack of card bonus on movement actions
    // Differentiate between actual attacks (into enemy) vs pure repositioning
    if (actionType === "attack") {
      let attackBonus = 1.0; // Base bonus for repositioning (advancing position)
      let isAvatarAttack = !!(p && p._attackMeta && p._attackMeta.isAvatarAttack);
      try {
        const oppNum = seatNum(otherSeat(seat));
        const oppAvatarPos = getOpponentAvatarPos(state, seat);
        const oppAvatarKey = `${oppAvatarPos[0]},${oppAvatarPos[1]}`;

        // Check unit movement patches (permanents)
        const permPatch = p && p.permanents;
        if (permPatch) {
          for (const cellKey of Object.keys(permPatch)) {
            const arr = Array.isArray(permPatch[cellKey]) ? permPatch[cellKey] : [];
            const movingInto = arr.some(item => item && item.tapped === true);
            if (movingInto) {
              const hasEnemy = (state.permanents && state.permanents[cellKey] || [])
                .some(item => item && Number(item.owner) === oppNum);
              const sites = (state.board && state.board.sites) || {};
              const hasEnemySite = sites[cellKey] && Number(sites[cellKey].owner) === oppNum;
              const isAvatarCell = cellKey === oppAvatarKey;
              if (isAvatarCell) attackBonus = 8.0;
              else if (hasEnemy) attackBonus = 0.0; // Trade quality determines bonus
              else if (hasEnemySite) attackBonus = 5.0;
            }
          }
        }

        // Check avatar movement patches (avatars key with _attackMeta)
        if (p && p.avatars && p._attackMeta) {
          const toKey = p._attackMeta.toKey;
          if (toKey === oppAvatarKey) attackBonus = 8.0;
          else {
            const hasEnemy = (state.permanents && state.permanents[toKey] || [])
              .some(item => item && Number(item.owner) === oppNum);
            const sites = (state.board && state.board.sites) || {};
            const hasEnemySite = sites[toKey] && Number(sites[toKey].owner) === oppNum;
            if (hasEnemy) attackBonus = 0.0; // Trade quality determines bonus
            else if (hasEnemySite) attackBonus = 5.0;
          }
        }
      } catch {}

      // Keyword-aware combat trade evaluation
      try {
        if (p && p._attackMeta) {
          const atkCard = p._attackMeta.attackerCard;
          const atkKw = getCardKeywords(atkCard);
          const toKey = p._attackMeta.toKey;

          // Get target unit info (if attacking a unit, not avatar/site)
          const targetPerms = (state && state.permanents && state.permanents[toKey]) || [];
          const oppNum = seatNum(otherSeat(seat));
          const targetEnemy = targetPerms.find(item => item && Number(item.owner) === oppNum);

          if (targetEnemy && targetEnemy.card) {
            const tgtKw = getCardKeywords(targetEnemy.card);
            const atkAtk = Number(atkCard && atkCard.attack || 0);
            const atkDef = Number(atkCard && (atkCard.defence || atkCard.defense) || 0);
            const tgtAtk = Number(targetEnemy.card.attack || 0);
            const tgtDef = Number(targetEnemy.card.defence || targetEnemy.card.defense || 0);
            const tgtDamage = Number(targetEnemy.damage || 0);
            const tgtEffectiveDef = Math.max(0, tgtDef - tgtDamage);

            // Evaluate trade outcome (consider existing damage on target)
            const weKill = atkAtk >= tgtEffectiveDef || atkKw.has("lethal");
            const theyKill = tgtAtk >= atkDef || tgtKw.has("lethal");
            const theyHitFirst = tgtKw.has("initiative") && !atkKw.has("initiative");

            // Trade quality is THE primary scoring factor for attacking units
            if (weKill && !theyKill) attackBonus += 10.0;      // Great trade: we kill, survive → ALWAYS DO THIS
            else if (weKill && theyKill) attackBonus += 3.0;    // Even trade: both die → okay if costs match
            else if (!weKill && theyKill) attackBonus -= 6.0;   // Bad trade: we die, they survive → NEVER
            else if (!weKill && !theyKill) attackBonus -= 5.0;  // Bounce: nobody dies, wastes our action & taps unit

            // Initiative disadvantage: they kill us before we strike
            if (theyHitFirst && theyKill) attackBonus -= 4.0;

            // Bonus: target is already damaged (we can finish it off)
            if (tgtDamage > 0 && weKill) attackBonus += 2.0;

            // Lethal vs high-DEF target: extra value
            if (atkKw.has("lethal") && tgtDef >= 4) attackBonus += 2.0;

            // Target has ward: harder to damage, penalize
            if (tgtKw.has("ward")) attackBonus -= 2.0;

            // Target has stealth: should not be attacking (safety net)
            if (tgtKw.has("stealth")) attackBonus -= 10.0;

            // AVATAR attacking minions: almost always a bad idea
            // Avatar takes counter-damage as life loss (tgtAtk -> player life)
            if (isAvatarAttack) {
              attackBonus -= tgtAtk * 3.0; // Heavy penalty per counter-damage to life
              if (!weKill) attackBonus -= 12.0; // Can't kill = pure waste + life loss
              // Only acceptable: kill a 0-ATK target (free kill)
              if (weKill && tgtAtk === 0) attackBonus += 6.0;
            }
          } else if (isAvatarAttack && !targetEnemy) {
            // Avatar attacking site or empty cell: risky — avatar ends up in enemy territory
            // Sites: mana denial is good but avatar is now exposed with 0 DEF
            // Only allow if the cell has an enemy site (mana denial) — still risky
            const toKey2 = p._attackMeta.toKey;
            const sites2 = (state && state.board && state.board.sites) || {};
            const hasSite2 = sites2[toKey2] && Number(sites2[toKey2].owner) === seatNum(otherSeat(seat));
            if (!hasSite2) {
              // No site, no unit — avatar moving into empty/unknown territory
              attackBonus -= 10.0;
            } else {
              // Attacking a site — still discourage unless no minions available
              attackBonus -= 3.0;
            }
          }
        }
      } catch {}

      // General avatar attack caution: prefer using minions instead
      // Avatar should focus on placing sites and drawing, not fighting
      // The avatar has 0 DEF so ALL counter-damage goes directly to life total
      if (isAvatarAttack) {
        attackBonus -= 15.0; // Heavy base discouragement — avatar combat is almost never correct
      }

      // Defensive positioning: penalize moving units that are currently defending
      // our avatar or sites when enemy threats exist nearby
      try {
        if (p && p._attackMeta && !isAvatarAttack) {
          const fromKey = p._attackMeta.fromKey;
          const myAvatarPos = getAvatarPos(state, seat);
          const myAvatarKey = `${myAvatarPos[0]},${myAvatarPos[1]}`;
          const fromPos = parseCellKey(fromKey);
          const oppNum = seatNum(otherSeat(seat));
          // Check if there are enemy units nearby our avatar
          const nearbyEnemies = neighborsInBounds(state, myAvatarKey).some(nk => {
            const arr = (state.permanents && state.permanents[nk]) || [];
            return arr.some(item => item && Number(item.owner) === oppNum);
          });
          // If enemies are near our avatar and this unit is adjacent to avatar, penalize leaving
          if (nearbyEnemies && fromPos) {
            const distToAvatar = manhattan([fromPos.x, fromPos.y], myAvatarPos);
            if (distToAvatar <= 1) {
              // This unit is defending our avatar — heavy penalty for leaving
              attackBonus -= 3.0;
            }
          }
          // Penalize pure repositioning (no enemy at target) more heavily
          if (attackBonus <= 1.0) {
            // This is just a repositioning move, not attacking anything
            // Moving taps the unit, making it unable to defend on opponent's turn
            attackBonus -= 1.5;
          }
        }
      } catch {}

      s = s + attackBonus;
    }

    scored.push({
      patch: p,
      score: s,
      features: f,
      state: next,
      actionType,
      modifier,
      cardBonus,
      cardName,
    });
  }

  // Diagnostic: log top-scored candidates
  try {
    const sortedForLog = [...scored].sort((a, b) => b.score - a.score).slice(0, 5);
    console.log(`[Engine] Top candidates (${scored.length} total):`);
    for (const c of sortedForLog) {
      console.log(`  ${c.actionType}: score=${c.score.toFixed(2)} mod=${c.modifier.toFixed(1)} card=${c.cardName || '-'} bonus=${(c.cardBonus || 0).toFixed(2)}`);
    }
  } catch {}

  let nodes = scored.length;
  let depthReached = 1;

  function isTactical(prevF, nextF) {
    if (!prevF || !nextF) return false;
    if ((nextF.threats_my || 0) > (prevF.threats_my || 0)) return true;
    if ((nextF.lethal_now || 0) > (prevF.lethal_now || 0)) return true;
    return false;
  }

  function bestChildValue(parentState, parentF, depthLeft, qLeft) {
    if (depthLeft <= 0 || Date.now() >= softDeadline) return 0;
    const children = generateCandidates(parentState, seat, options || {});
    let bestScore = -Infinity;
    let bestState = null;
    let bestF = null;
    const limit = Math.min(children.length, beamWidth);
    for (let j = 0; j < limit; j++) {
      const cpatch = children[j];
      const cstate = applyPatch(parentState, cpatch);
      const cf = extractFeatures(parentState, cstate, seat);
      const cs = evalFeatures(cf, w);
      nodes++;
      if (cs > bestScore) {
        bestScore = cs;
        bestState = cstate;
        bestF = cf;
      }
      if (Date.now() >= softDeadline) break;
    }
    if (bestState && depthLeft > 1) {
      depthReached = Math.max(depthReached, maxDepth - depthLeft + 2);
      return (
        bestScore +
        gamma * bestChildValue(bestState, bestF, depthLeft - 1, qLeft)
      );
    }
    if (
      bestState &&
      depthLeft === 1 &&
      qLeft > 0 &&
      isTactical(parentF, bestF)
    ) {
      depthReached = Math.max(depthReached, maxDepth - depthLeft + 2);
      return bestScore + gamma * bestChildValue(bestState, bestF, 1, qLeft - 1);
    }
    return bestScore;
  }

  if (maxDepth >= 2 && Date.now() < softDeadline) {
    for (let i = 0; i < scored.length; i++) {
      if (Date.now() >= softDeadline) break;
      const root = scored[i];
      const refinedTail = bestChildValue(
        root.state,
        root.features,
        maxDepth - 1,
        Number(conf.quiescenceDepth || 0)
      );
      root.refined =
        root.score + gamma * (Number.isFinite(refinedTail) ? refinedTail : 0);
    }
  }

  // Root exploration (training mode): ε-greedy random pick
  const epsilon =
    options &&
    options.exploration &&
    Number.isFinite(options.exploration.epsilon_root)
      ? options.exploration.epsilon_root
      : 0;
  let chosen = null;
  if (
    options &&
    options.mode === "train" &&
    rng &&
    epsilon > 0 &&
    rng() < epsilon
  ) {
    const idx =
      Math.floor((rng() || Math.random()) * scored.length) %
      Math.max(1, scored.length);
    chosen = scored[idx] || null;
  } else {
    // Pick highest refined score (fallback to root score)
    let best = null;
    let bestScore = -Infinity;
    for (const it of scored) {
      const sc = Number.isFinite(it.refined) ? it.refined : it.score;
      if (sc > bestScore) {
        bestScore = sc;
        best = it;
      }
    }
    chosen = best;
  }

  const timeMs = Date.now() - start;
  function summarizeChosenCards(patch) {
    try {
      if (!patch || typeof patch !== "object") return null;
      const out = {};
      // Draw source detection (heuristic from patch contents)
      try {
        if (patch.zones && typeof patch.zones === "object") {
          const seats = Object.keys(patch.zones);
          const sk = seats && seats.length ? seats[0] : null;
          const z = sk ? patch.zones[sk] : null;
          if (z && typeof z === "object") {
            if (
              Object.prototype.hasOwnProperty.call(z, "spellbook") &&
              Object.prototype.hasOwnProperty.call(z, "hand")
            )
              out.drawFrom = "spellbook";
            if (
              Object.prototype.hasOwnProperty.call(z, "atlas") &&
              Object.prototype.hasOwnProperty.call(z, "hand")
            ) {
              const tapped =
                patch.avatars &&
                sk &&
                patch.avatars[sk] &&
                patch.avatars[sk].tapped === true;
              out.drawFrom = tapped ? "atlas_tap" : "atlas";
            }
          }
        }
      } catch {}
      if (patch.board && patch.board.sites) {
        const keys = Object.keys(patch.board.sites);
        for (const k of keys) {
          const t = patch.board.sites[k];
          const c = t && t.card;
          if (c && (c.slug || c.name)) {
            out.playedSite = { slug: c.slug || null, name: c.name || null };
            break;
          }
        }
      }
      if (patch.permanents) {
        for (const cell of Object.keys(patch.permanents)) {
          const arr = Array.isArray(patch.permanents[cell])
            ? patch.permanents[cell]
            : [];
          for (const p of arr) {
            const c = p && p.card;
            if (c && (c.slug || c.name)) {
              // T049: Distinguish auras from units based on type
              const cardType = String(c.type || "").toLowerCase();
              if (
                cardType.includes("aura") ||
                cardType.includes("enchantment")
              ) {
                out.playedAura = { slug: c.slug || null, name: c.name || null };
              } else {
                out.playedUnit = { slug: c.slug || null, name: c.name || null };
              }
              break;
            }
          }
          if (out.playedUnit || out.playedAura) break;
        }
      }
      return Object.keys(out).length ? out : null;
    } catch {
      return null;
    }
  }
  try {
    if (options && typeof options.logger === "function") {
      // T015: Compute evaluation breakdown for chosen move
      let evaluationBreakdown = null;
      if (chosen && chosen.features) {
        const result = evalFeaturesWithBreakdown(chosen.features, w);
        evaluationBreakdown = result.breakdown;
      }

      // T015: Build candidate details with action labels and scores
      const candidateDetails = scored.map((x) => {
        const cards = summarizeChosenCards(x.patch);
        let actionLabel = "pass";
        if (cards) {
          if (cards.playedUnit)
            actionLabel = `play_unit:${
              cards.playedUnit.name || cards.playedUnit.slug || "?"
            }`;
          else if (cards.playedAura)
            actionLabel = `play_aura:${
              cards.playedAura.name || cards.playedAura.slug || "?"
            }`; // T049
          else if (cards.playedSite)
            actionLabel = `play_site:${
              cards.playedSite.name || cards.playedSite.slug || "?"
            }`;
          else if (cards.drawFrom) actionLabel = `draw:${cards.drawFrom}`;
        }
        return {
          action: actionLabel,
          score: x.score,
          refined: Number.isFinite(x.refined) ? x.refined : x.score,
          isLegal: true, // All scored candidates are legal (illegal ones filtered)
        };
      });

      options.logger({
        mode: options.mode || "evaluate",
        seed: options.seed || null,
        thetaId: (theta && theta.meta && theta.meta.id) || null,
        candidates: scored.map((x) => ({ score: x.score, refined: x.refined })),
        chosen: chosen
          ? { score: chosen.score, refined: chosen.refined }
          : null,
        rootFeatures: chosen ? chosen.features : null,
        rootEval: chosen
          ? Number.isFinite(chosen.refined)
            ? chosen.refined
            : chosen.score
          : null,
        nodes,
        depth: depthReached,
        beam: beamWidth,
        epsilonRoot:
          options && options.exploration
            ? options.exploration.epsilon_root
            : undefined,
        timeMs,
        t: Date.now(),
        chosenCards:
          chosen && chosen.patch ? summarizeChosenCards(chosen.patch) : null,
        // T015: Enhanced telemetry fields
        evaluationBreakdown,
        candidateDetails,
        filteredCandidates: generationStats
          ? {
              totalUnitsInHand: generationStats.totalUnitsInHand,
              filteredUnaffordable: generationStats.filteredUnaffordable,
              playableUnits: generationStats.playableUnits,
              sitesGated: generationStats.sitesGated,
              candidatesGenerated: generationStats.candidatesGenerated,
              candidatesAfterLimit: list.length,
            }
          : null,
      });
    }
  } catch {}
  if (chosen && chosen.patch) return chosen.patch;
  return endTurnPatch(state, seat);
}

module.exports = { loadTheta, createRng, search, initCardEvaluations };
