// Pure engine module (no Node I/O). Consumers provide θ and optional telemetry logger.

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

function loadTheta() {
  return {
    meta: { id: "baseline/v0" },
    search: { beamWidth: 8, maxDepth: 3, quiescenceDepth: 1, nodeCap: 2000, budgetMs: 60, gamma: 0.6 },
    exploration: { epsilon_root: 0, gumbel_leaf: 0 },
    weights: {
      w_life: 0.8,
      w_lethal_now: 5.0,
      w_opp_lethal_next: -4.5,
      w_atk: 0.5,
      w_hp: 0.2,
      w_threats_my: 0.7,
      w_threats_opp: -0.6,
      w_hand: 0.6,
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
      w_mana_avail: 0.05,
      w_sites: 0.1,
      w_providers: 0.1,
      w_thresholds_total: 0.2,
      // Encourage advancing units toward the opponent avatar (movement heuristic)
      w_advance: 0.08,
    },
    constraints: { clamp_eval_min: -50, clamp_eval_max: 50, legal_move_fallback: "pass_or_minimal" },
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
  const z = state && state.zones && typeof state.zones === "object" ? state.zones[seat] : null;
  if (z && typeof z === "object") return z;
  return { spellbook: [], atlas: [], hand: [], graveyard: [], battlefield: [], banished: [] };
}

function getAvatarPos(state, seat) {
  const av = state && state.avatars && state.avatars[seat];
  const pos = av && Array.isArray(av.pos) ? av.pos : null;
  if (pos) return pos;
  const w = (state && state.board && state.board.size && state.board.size.w) || 5;
  const h = (state && state.board && state.board.size && state.board.size.h) || 5;
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

function inBounds(x, y, w, h) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

function isEmpty(state, x, y) {
  const key = `${x},${y}`;
  const tile = state && state.board && state.board.sites && state.board.sites[key];
  return !(tile && tile.card);
}

function findAnyEmptyCell(state) {
  const w = (state && state.board && state.board.size && state.board.size.w) || 5;
  const h = (state && state.board && state.board.size && state.board.size.h) || 5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isEmpty(state, x, y)) return `${x},${y}`;
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
  const w = (state && state.board && state.board.size && state.board.size.w) || 5;
  const h = (state && state.board && state.board.size && state.board.size.h) || 5;
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
  const idx = hand.findIndex((c) => c && typeof c.type === "string" && c.type.toLowerCase().includes("site"));
  if (idx === -1) return null;
  return { idx, card: hand[idx] };
}

function getCardThresholds(card) {
  try {
    const th = card && card.thresholds ? card.thresholds : null;
    if (!th || typeof th !== 'object') return null;
    const out = { air: 0, water: 0, earth: 0, fire: 0 };
    if (Number.isFinite(Number(th.air))) out.air = Number(th.air);
    if (Number.isFinite(Number(th.water))) out.water = Number(th.water);
    if (Number.isFinite(Number(th.earth))) out.earth = Number(th.earth);
    if (Number.isFinite(Number(th.fire))) out.fire = Number(th.fire);
    return out;
  } catch { return null; }
}

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
    const t = String(c?.type || '').toLowerCase();
    if (!t) return true;
    if (t.includes('site')) return false;
    if (t.includes('avatar')) return false;
    if (t.includes('minion')) return true;
    if (t.includes('unit')) return true;
    if (t.includes('relic')) return true;
    if (t.includes('structure')) return true;
    if (t.includes('artifact')) return true;
    // Fallback: treat unknown non-site, non-avatar as permanent
    return true;
  };
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (!c) continue;
    if (!isPermanent(c)) continue;
    const req = getCardThresholds(c);
    if (hasThresholds(state, seat, req)) return { idx: i, card: c };
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
  try { return (state && state.avatars && typeof state.avatars === 'object' && state.avatars[seat]) || {}; } catch { return {}; }
}

// Tap avatar to draw a site (cannot play a site afterward because avatar is tapped)
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

function playSitePatch(state, seat) {
  const z = getZones(state, seat);
  const hand = Array.isArray(z.hand) ? [...z.hand] : [];
  // Prefer Earth-like sites first (helps satisfy common early thresholds)
  let pick = null;
  const earthIdx = hand.findIndex((c) => c && typeof c.type === 'string' && c.type.toLowerCase().includes('site') && String(c.name || '').toLowerCase().includes('valley'));
  if (earthIdx !== -1) pick = { idx: earthIdx, card: hand[earthIdx] };
  if (!pick) pick = chooseSiteFromHand({ hand });
  if (!pick) return null;
  hand.splice(pick.idx, 1);
  const a = getAvatarPos(state, seat);
  let cell = null;
  if (ownedSiteKeys(state, seat).length === 0) {
    const ax = a[0];
    const ay = a[1];
    cell = isEmpty(state, ax, ay) ? `${ax},${ay}` : findAnyEmptyCell(state);
  } else {
    cell = findAdjacentEmptyToOwned(state, seat) || findAnyEmptyCell(state);
  }
  const myNum = seatNum(seat);
  const patch = { zones: {}, board: { sites: {} } };
  patch.zones[seat] = { ...z, hand };
  patch.board.sites[cell] = { owner: myNum, tapped: false, card: pick.card };
  return patch;
}

function playUnitPatch(state, seat, placedCell) {
  const z = getZones(state, seat);
  const hand = Array.isArray(z.hand) ? [...z.hand] : [];
  const pick = chooseNonSiteFromHand(state, seat, { hand });
  if (!pick) return null;
  hand.splice(pick.idx, 1);
  let cell = placedCell || findAnyOwnedSiteCell(state, seat);
  if (!cell) cell = findAnyEmptyCell(state);
  const myNum = seatNum(seat);
  const existing = (state && state.permanents && state.permanents[cell]) || [];
  const patch = { zones: {}, permanents: {} };
  patch.zones[seat] = { ...z, hand };
  patch.permanents[cell] = [...existing, { owner: myNum, card: pick.card, tapped: false }];
  return patch;
}

function endTurnPatch(state, seat) {
  const my = seatNum(seat);
  const other = my === 1 ? 2 : 1;
  return { currentPlayer: other, phase: "Main" };
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
    return [2, seat === 'p1' ? 0 : 3];
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
        if (item && Number(item.owner) === myNum) out.push({ at: cellKey, index: i, item });
      } catch {}
    }
  }
  return out;
}

function neighborsInBounds(state, atKey) {
  const pos = parseCellKey(atKey);
  const w = (state && state.board && state.board.size && state.board.size.w) || 5;
  const h = (state && state.board && state.board.size && state.board.size.h) || 5;
  if (!pos) return [];
  const candidates = [
    [pos.x + 1, pos.y],
    [pos.x - 1, pos.y],
    [pos.x, pos.y + 1],
    [pos.x, pos.y - 1],
  ];
  const res = [];
  for (const [x,y] of candidates) if (inBounds(x, y, w, h)) res.push(`${x},${y}`);
  return res;
}

function hasEnemyAt(state, seat, cellKey) {
  const opp = seatNum(otherSeat(seat));
  const arr = (state && state.permanents && state.permanents[cellKey]) || [];
  if (!Array.isArray(arr)) return false;
  for (const p of arr) try { if (Number(p.owner) === opp) return true; } catch {}
  return false;
}

function hasFriendlyAt(state, seat, cellKey) {
  const me = seatNum(seat);
  const arr = (state && state.permanents && state.permanents[cellKey]) || [];
  if (!Array.isArray(arr)) return false;
  for (const p of arr) try { if (Number(p.owner) === me) return true; } catch {}
  return false;
}

function manhattan(a, b) {
  try { return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]); } catch { return 0; }
}

function buildMovePatch(state, seat, fromKey, index, toKey) {
  try {
    const perPrev = (state && state.permanents) || {};
    const fromArrPrev = Array.isArray(perPrev[fromKey]) ? perPrev[fromKey] : [];
    const fromArr = [...fromArrPrev];
    const spliced = fromArr.splice(index, 1);
    const item = spliced[0];
    if (!item) return null;
    const toArrPrev = Array.isArray(perPrev[toKey]) ? perPrev[toKey] : [];
    const toArr = [...toArrPrev, { ...item, tapped: true }];
    return { permanents: { [fromKey]: fromArr, [toKey]: toArr } };
  } catch { return null; }
}

function generateMoveCandidates(state, seat) {
  const units = myUnits(state, seat).filter(u => !u.item?.tapped);
  if (!units.length) return [];
  // Choose the unit closest to opponent avatar
  const oppPos = getOpponentAvatarPos(state, seat);
  units.sort((a,b) => {
    const ap = parseCellKey(a.at); const bp = parseCellKey(b.at);
    const ad = ap ? manhattan([ap.x, ap.y], oppPos) : 999;
    const bd = bp ? manhattan([bp.x, bp.y], oppPos) : 999;
    return ad - bd;
  });
  const chosen = units[0];
  const neigh = neighborsInBounds(state, chosen.at).filter(k => !hasFriendlyAt(state, seat, k));
  // Prefer moving into a cell with an enemy; else reduce distance
  const intoEnemy = neigh.filter(k => hasEnemyAt(state, seat, k));
  const candidates = [];
  const tryKeys = intoEnemy.length ? intoEnemy : neigh.sort((k1,k2) => {
    const p1 = parseCellKey(k1), p2 = parseCellKey(k2);
    const d1 = p1 ? manhattan([p1.x,p1.y], oppPos) : 999;
    const d2 = p2 ? manhattan([p2.x,p2.y], oppPos) : 999;
    return d1 - d2;
  });
  for (const k of tryKeys.slice(0, 2)) {
    const p = buildMovePatch(state, seat, chosen.at, chosen.index, k);
    if (p) candidates.push(p);
  }
  return candidates;
}

// Minimal providers (copied subset from server rules to avoid imports)
const MANA_PROVIDER_BY_NAME = new Set([
  'abundance',
  'amethyst core',
  'aquamarine core',
  'atlantean fate',
  'avalon',
  'blacksmith family',
  'caerleon-upon-usk',
  'castle servants',
  'common cottagers',
  'finwife',
  "fisherman's family",
  'glastonbury tor',
  'joyous garde',
  'onyx core',
  'pristine paradise',
  'ruby core',
  'shrine of the dragonlord',
  'the colour out of space',
  'tintagel',
  'valley of delight',
  'wedding hall',
  'älvalinne dryads',
]);

const THRESHOLD_GRANT_BY_NAME = {
  'amethyst core': { air: 1 },
  'aquamarine core': { water: 1 },
  'onyx core': { earth: 1 },
  'ruby core': { fire: 1 },
};

// Fallback thresholds for standard sites by name when card.thresholds is missing
const SITE_THRESHOLD_BY_NAME = {
  'spire': { air: 1 },
  'stream': { water: 1 },
  'valley': { earth: 1 },
  'wasteland': { fire: 1 },
};

function accumulateThresholds(acc, src) {
  if (!src || typeof src !== 'object') return;
  const keys = ['air','water','earth','fire'];
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
    let th = tile && tile.card && tile.card.thresholds ? tile.card.thresholds : null;
    if (!th) {
      try {
        const nm = (tile && tile.card && tile.card.name ? String(tile.card.name) : '').toLowerCase();
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
      const nm = (p.card && p.card.name ? String(p.card.name) : '').toLowerCase();
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
        const nm = (p.card && p.card.name ? String(p.card.name) : '').toLowerCase();
        if (MANA_PROVIDER_BY_NAME.has(nm)) n++;
      } catch {}
    }
  }
  return n;
}

function extractFeatures(prevState, nextState, seat) {
  const me = seat;
  const opp = otherSeat(seat);
  const players = (nextState && nextState.players) || {};
  const p1 = players.p1 || {};
  const p2 = players.p2 || {};
  const lifeMy = me === "p1" ? Number(p1.life || 0) || 0 : Number(p2.life || 0) || 0;
  const lifeOpp = me === "p1" ? Number(p2.life || 0) || 0 : Number(p1.life || 0) || 0;
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
  const prevSpent = (prevState && prevState.resources && prevState.resources[meKey] && Number(prevState.resources[meKey].spentThisTurn)) || 0;
  const nextSpent = (nextState && nextState.resources && nextState.resources[meKey] && Number(nextState.resources[meKey].spentThisTurn)) || 0;
  const available = countOwnedManaSites(nextState, me) + countManaProvidersFromPermanents(nextState, me);
  const spentInc = Math.max(0, nextSpent - prevSpent);
  const onCurve = available > 0 ? Math.min(1, spentInc / Math.max(1, available)) : 0;
  const manaWasted = Math.max(0, available - nextSpent);
  const sitesMy = (() => { let n=0; const s=(nextState&&nextState.board&&nextState.board.sites)||{}; for(const k of Object.keys(s)){ const t=s[k]; if(t&&t.card&&Number(t.owner)===seatNum(me)) n++; } return n; })();
  const sitesOpp = (() => { let n=0; const s=(nextState&&nextState.board&&nextState.board.sites)||{}; for(const k of Object.keys(s)){ const t=s[k]; if(t&&t.card&&Number(t.owner)===seatNum(opp)) n++; } return n; })();
  const providersMy = countManaProvidersFromPermanents(nextState, me);
  const providersOpp = countManaProvidersFromPermanents(nextState, opp);
  const thMy = countThresholdsForSeat(nextState, me);
  const thOpp = countThresholdsForSeat(nextState, opp);
  const thTotMy = (thMy.air||0)+(thMy.water||0)+(thMy.earth||0)+(thMy.fire||0);
  const thTotOpp = (thOpp.air||0)+(thOpp.water||0)+(thOpp.earth||0)+(thOpp.fire||0);
  // Advancement: closer average distance of my units to opponent avatar
  const oppPos = getAvatarPos(nextState, opp);
  let myCount = 0; let distSum = 0;
  for (const key of Object.keys(per)) {
    const arr = Array.isArray(per[key]) ? per[key] : [];
    const p = parseCellKey(key);
    if (!p) continue;
    for (const it of arr) {
      try {
        if (Number(it.owner) === seatNum(me)) { myCount++; distSum += manhattan([p.x,p.y], oppPos); }
      } catch {}
    }
  }
  const advance = myCount > 0 ? - (distSum / myCount) : 0;
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
    lethal_now: lifeOpp <= 0 ? 1 : 0,
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
  };
}

function evalFeatures(f, w) {
  let s = 0;
  s += (w.w_life || 0) * (f.life_my - f.life_opp);
  s += (w.w_atk || 0) * (f.atk_my - f.atk_opp);
  s += (w.w_hp || 0) * (f.hp_my - f.hp_opp);
  s += (w.w_hand || 0) * (f.hand_my - f.hand_opp);
  s += (w.w_threats_my || 0) * f.threats_my + (w.w_threats_opp || 0) * f.threats_opp;
  s += (w.w_mana_waste || 0) * f.mana_wasted;
  s += (w.w_mana_avail || 0) * f.mana_avail;
  s += (w.w_sites || 0) * (f.sites_my - f.sites_opp);
  s += (w.w_providers || 0) * (f.providers_my - f.providers_opp);
  s += (w.w_thresholds_total || 0) * (f.th_total_my - f.th_total_opp);
  s += (w.w_on_curve || 0) * f.on_curve;
  s += (w.w_lethal_now || 0) * f.lethal_now + (w.w_opp_lethal_next || 0) * f.opp_lethal_next;
  s += (w.w_engine_online || 0) * f.engines_online + (w.w_sweeper_risk || 0) * f.sweeper_risk;
  s += (w.w_action_count_penalty || 0) * 0;
  s += (w.w_advance || 0) * (f.advance || 0);
  if (Number.isFinite(s) === false) s = 0;
  return s;
}

function generateCandidates(state, seat, options = {}) {
  const base = deepClone(state || {});
  const moves = [];
  const skipDraw = options && options.skipDrawThisTurn === true;

  // Helper to extract the placed site cell from a site patch
  function siteCellFromPatch(p) {
    try {
      if (!p || !p.board || !p.board.sites) return null;
      const keys = Object.keys(p.board.sites);
      return keys.length ? keys[0] : null;
    } catch { return null; }
  }

  // Generate draw alternatives
  const drawSpell = skipDraw ? null : drawFromPilePatch(base, seat, "spellbook");
  const drawAtlas = skipDraw ? null : drawFromAtlasPatch(base, seat);
  const drawAtlasTap = skipDraw ? null : drawFromAtlasWithTapPatch(base, seat);

  // Paths after drawing from Spellbook
  const baseAfterDrawS = drawSpell ? applyPatch(base, drawSpell) : base;
  const siteAfterDrawS = playSitePatch(baseAfterDrawS, seat);
  const cellAfterDrawS = siteCellFromPatch(siteAfterDrawS);
  const unitAfterDrawS = playUnitPatch(siteAfterDrawS ? applyPatch(baseAfterDrawS, siteAfterDrawS) : baseAfterDrawS, seat, cellAfterDrawS);

  // Paths after drawing from Atlas
  const baseAfterDrawA = drawAtlas ? applyPatch(base, drawAtlas) : base;
  const siteAfterDrawA = playSitePatch(baseAfterDrawA, seat);
  const cellAfterDrawA = siteCellFromPatch(siteAfterDrawA);
  const unitAfterDrawA = playUnitPatch(siteAfterDrawA ? applyPatch(baseAfterDrawA, siteAfterDrawA) : baseAfterDrawA, seat, cellAfterDrawA);

  // Paths after tapping to draw from Atlas (do not attempt to play a site in the same patch)

  // Paths without drawing
  const siteBase = playSitePatch(base, seat);
  const cellBase = siteCellFromPatch(siteBase);
  const unitBase = playUnitPatch(siteBase ? applyPatch(base, siteBase) : base, seat, cellBase);

  // Heuristic gating to avoid spamming sites when units are playable or we already have many sites
  const anyUnitCandidate = !!(unitBase || unitAfterDrawS || unitAfterDrawA);
  const ownedSitesNow = countOwnedManaSites(base, seat);
  const allowSiteOnly = (ownedSitesNow < 2) && !anyUnitCandidate;

  // Hand composition for draw preference
  const handNow = getZones(base, seat).hand || [];
  const handNonSites = handNow.filter((c) => c && typeof c.type === 'string' && !c.type.toLowerCase().includes('site'));
  const handSites = handNow.length - handNonSites.length;
  const preferDrawSpell = (ownedSitesNow >= 2) || (handSites > 0 && handNonSites.length === 0);
  const allowTapDraw = ownedSitesNow < 4 && handSites === 0;

  // Movement-only patches (for one unit) — keep small to avoid branching blowup
  const movePatches = generateMoveCandidates(base, seat);
  const pass = {};
  function mergeTwo(a, b) {
    return mergeReplaceArrays(a || {}, b || {});
  }
  function seq(arr) {
    let p = {};
    for (const part of arr) if (part) p = mergeTwo(p, part);
    return p;
  }

  // Reprioritize: unit-inclusive sequences first
  if (drawSpell && (siteAfterDrawS || unitAfterDrawS)) {
    moves.push(seq([drawSpell, siteAfterDrawS, unitAfterDrawS]));
  }
  if (!preferDrawSpell && drawAtlas && (siteAfterDrawA || unitAfterDrawA)) {
    moves.push(seq([drawAtlas, siteAfterDrawA, unitAfterDrawA]));
  }
  if (siteBase && unitBase) moves.push(seq([siteBase, unitBase]));
  if (unitBase) moves.push(seq([unitBase]));

  // Draw-only (prefer spellbook when flooded with sites)
  if (preferDrawSpell && drawSpell) moves.push(seq([drawSpell]));
  if (!preferDrawSpell && drawAtlas) moves.push(seq([drawAtlas]));
  if (drawSpell && !preferDrawSpell) moves.push(seq([drawSpell]));
  if (drawAtlasTap && allowTapDraw) moves.push(seq([drawAtlasTap]));

  // Site-only (gated)
  if (allowSiteOnly) {
    if (!preferDrawSpell && drawAtlas && siteAfterDrawA) moves.push(seq([drawAtlas, siteAfterDrawA]));
    if (drawSpell && siteAfterDrawS) moves.push(seq([drawSpell, siteAfterDrawS]));
    if (siteBase) moves.push(seq([siteBase]));
  }

  // Movement-first options, then pass
  if (movePatches && movePatches.length) {
    moves.push(seq([movePatches[0]]));
    if (drawSpell) moves.push(seq([drawSpell, movePatches[0]]));
    if (drawAtlas) moves.push(seq([drawAtlas, movePatches[0]]));
    if (movePatches[1]) moves.push(seq([movePatches[1]]));
  }
  moves.push(seq([pass]));
  return moves;
}

function search(state, seat, theta, rng, options) {
  const start = Date.now();
  const thetaUse = (theta && theta.weights) ? theta : loadTheta();
  const w = (thetaUse && thetaUse.weights) || {};
  const conf = (thetaUse && thetaUse.search) || {};
  const beamWidth = Number(conf.beamWidth || 8) || 8;
  const maxDepth = Math.max(1, Number(conf.maxDepth || 2) || 2);
  const budgetMs = Math.max(1, Number(conf.budgetMs || 60) || 60);
  const gamma = (typeof conf.gamma === 'number') ? conf.gamma : 0.6;
  const softDeadline = start + Math.floor(budgetMs * 2); // soft budget, never hard-fail

  const list = generateCandidates(state, seat, options || {});
  const scored = [];
  for (const p of list) {
    const next = applyPatch(state, p);
    const f = extractFeatures(state, next, seat);
    const s = evalFeatures(f, w);
    scored.push({ patch: p, score: s, features: f, state: next });
  }

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
      if (cs > bestScore) { bestScore = cs; bestState = cstate; bestF = cf; }
      if (Date.now() >= softDeadline) break;
    }
    if (bestState && depthLeft > 1) {
      depthReached = Math.max(depthReached, (maxDepth - depthLeft + 2));
      return bestScore + gamma * bestChildValue(bestState, bestF, depthLeft - 1, qLeft);
    }
    if (bestState && depthLeft === 1 && qLeft > 0 && isTactical(parentF, bestF)) {
      depthReached = Math.max(depthReached, (maxDepth - depthLeft + 2));
      return bestScore + gamma * bestChildValue(bestState, bestF, 1, qLeft - 1);
    }
    return bestScore;
  }

  if (maxDepth >= 2 && Date.now() < softDeadline) {
    for (let i = 0; i < scored.length; i++) {
      if (Date.now() >= softDeadline) break;
      const root = scored[i];
      const refinedTail = bestChildValue(root.state, root.features, maxDepth - 1, Number(conf.quiescenceDepth || 0));
      root.refined = root.score + gamma * (Number.isFinite(refinedTail) ? refinedTail : 0);
    }
  }

  // Root exploration (training mode): ε-greedy random pick
  const epsilon = options && options.exploration && Number.isFinite(options.exploration.epsilon_root)
    ? options.exploration.epsilon_root
    : 0;
  let chosen = null;
  if (options && options.mode === "train" && rng && epsilon > 0 && rng() < epsilon) {
    const idx = Math.floor((rng() || Math.random()) * scored.length) % Math.max(1, scored.length);
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
      if (!patch || typeof patch !== 'object') return null;
      const out = {};
      // Draw source detection (heuristic from patch contents)
      try {
        if (patch.zones && typeof patch.zones === 'object') {
          const seats = Object.keys(patch.zones);
          const sk = seats && seats.length ? seats[0] : null;
          const z = sk ? patch.zones[sk] : null;
          if (z && typeof z === 'object') {
            if (Object.prototype.hasOwnProperty.call(z, 'spellbook') && Object.prototype.hasOwnProperty.call(z, 'hand')) out.drawFrom = 'spellbook';
            if (Object.prototype.hasOwnProperty.call(z, 'atlas') && Object.prototype.hasOwnProperty.call(z, 'hand')) {
              const tapped = patch.avatars && sk && patch.avatars[sk] && patch.avatars[sk].tapped === true;
              out.drawFrom = tapped ? 'atlas_tap' : 'atlas';
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
          const arr = Array.isArray(patch.permanents[cell]) ? patch.permanents[cell] : [];
          for (const p of arr) {
            const c = p && p.card;
            if (c && (c.slug || c.name)) {
              out.playedUnit = { slug: c.slug || null, name: c.name || null };
              break;
            }
          }
          if (out.playedUnit) break;
        }
      }
      return Object.keys(out).length ? out : null;
    } catch { return null; }
  }
  try {
    if (options && typeof options.logger === "function") {
      options.logger({
        mode: options.mode || "evaluate",
        seed: options.seed || null,
        thetaId: (theta && theta.meta && theta.meta.id) || null,
        candidates: scored.map((x) => ({ score: x.score, refined: x.refined })),
        chosen: chosen ? { score: chosen.score, refined: chosen.refined } : null,
        rootFeatures: chosen ? chosen.features : null,
        rootEval: chosen ? (Number.isFinite(chosen.refined) ? chosen.refined : chosen.score) : null,
        nodes,
        depth: depthReached,
        beam: beamWidth,
        epsilonRoot: options && options.exploration ? options.exploration.epsilon_root : undefined,
        timeMs,
        t: Date.now(),
        chosenCards: chosen && chosen.patch ? summarizeChosenCards(chosen.patch) : null,
      });
    }
  } catch {}
  if (chosen && chosen.patch) return chosen.patch;
  return endTurnPatch(state, seat);
}

module.exports = { loadTheta, createRng, search };
