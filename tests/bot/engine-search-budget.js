#!/usr/bin/env node
/* Bot engine search() harness: input immutability, baseline equivalence and time-budget ceiling.
 *
 *   node tests/bot/engine-search-budget.js [--states 300] [--seed 7] [--baseline-ref HEAD]
 *        [--deps-ref <ref> [--deps-dir <dir>]] [--skip-equivalence] [--skip-tight] [--skip-sweep]
 *        [--skip-gating] [--skip-timing] [--json out.json]
 *
 * Sections: equivalence with the deadline disabled (patch, telemetry, generateCandidates, no input
 * mutation, read-only proxies); tight real budget; virtual-clock deadline sweep (deterministic;
 * untruncated decisions must equal the baseline); spell preview cost gating; wall-time percentiles
 * (first and repeat decision per board) with the overshoot allowance check.
 *
 * The baseline engine is `git show <ref>:bots/engine/index.js`, compiled in-process under the
 * working-tree engine's filename so both engines resolve the same dependencies. After the engine
 * change is committed, pass its parent commit as --baseline-ref. With --deps-ref both engines run
 * against the shared CPU helpers (src/lib/game/cpu, bots/card-evaluations) of that ref, extracted
 * into --deps-dir (default: a fresh temp dir), which isolates engine changes from concurrent
 * helper edits. Exits 1 when any check fails.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const Module = require("module");
const os = require("os");
const path = require("path");
const util = require("util");

const ROOT = path.resolve(__dirname, "..", "..");
const argValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

function extractDeps(ref, dir) {
  const target = dir ? path.resolve(dir) : fs.mkdtempSync(path.join(os.tmpdir(), "engine-deps-"));
  fs.mkdirSync(path.join(target, "bots", "engine"), { recursive: true });
  const archive = execFileSync("git", ["archive", "--format=tar", ref, "src/lib/game/cpu", "bots/card-evaluations"], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", target], { input: archive });
  const dataLink = path.join(target, "data");
  if (!fs.existsSync(dataLink)) fs.symlinkSync(path.join(ROOT, "data"), dataLink, "dir");
  return target;
}

const DEPS_REF = argValue("deps-ref", null);
const DEPS_ROOT = DEPS_REF ? extractDeps(DEPS_REF, argValue("deps-dir", null)) : ROOT;
const SOURCE_ENGINE_FILE = path.join(ROOT, "bots", "engine", "index.js");
const ENGINE_FILE = path.join(DEPS_ROOT, "bots", "engine", "index.js");
const hasFlag = (name) => process.argv.includes(`--${name}`);
const STATE_COUNT = Number(argValue("states", "300"));
const SEED = Number(argValue("seed", "7"));
const BASELINE_REF = argValue("baseline-ref", "HEAD");
const HUGE_BUDGET_MS = 1e9;
const out = (line) => process.stdout.write(`${line}\n`);
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  if (failures.length <= 25) out(`  FAIL ${msg}`);
};

// ---------------------------------------------------------------------------
// Console capture (engine diagnostics are silenced while measuring)
// ---------------------------------------------------------------------------
function quiet(fn, sink) {
  const saved = { log: console.log, warn: console.warn, info: console.info, error: console.error };
  const record = (...args) => {
    if (sink) sink.push(util.format(...args));
  };
  console.log = record;
  console.warn = record;
  console.info = record;
  console.error = record;
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

// ---------------------------------------------------------------------------
// Engine loading
// ---------------------------------------------------------------------------
function replaceOnce(src, needle, replacement) {
  const first = src.indexOf(needle);
  if (first === -1 || src.indexOf(needle, first + 1) !== -1)
    throw new Error(`instrumentation anchor not found exactly once: ${needle.slice(0, 60)}`);
  return src.slice(0, first) + replacement + src.slice(first + needle.length);
}

/** Compile an engine source in-process under ENGINE_FILE; optionally wrap every state and patch
 * the engine produces in read-only proxies (records any in-place write). */
function compileEngine(source, { debug = false, readOnly = null } = {}) {
  let src = source;
  if (readOnly) {
    src = replaceOnce(
      src,
      "  const next = mergeReplaceArrays(state || {}, patch || {});\n  return next;",
      "  const next = mergeReplaceArrays(state || {}, patch || {});\n  return __harnessReadOnly(next);"
    );
    src = replaceOnce(
      src,
      "  if (options && options.collectStats) {\n    return { candidates: limited, stats };\n  }\n  return limited;",
      "  for (let i = 0; i < limited.length; i++) limited[i] = __harnessReadOnly(limited[i]);\n" +
        "  if (options && options.collectStats) {\n    return { candidates: limited, stats };\n  }\n  return limited;"
    );
  }
  const m = new Module(ENGINE_FILE, module);
  m.filename = ENGINE_FILE;
  m.paths = Module._nodeModulePaths(path.dirname(ENGINE_FILE));
  const previousDebug = process.env.CPU_ENGINE_DEBUG;
  if (debug) process.env.CPU_ENGINE_DEBUG = "1";
  else delete process.env.CPU_ENGINE_DEBUG;
  globalThis.__engineHarnessReadOnly = readOnly;
  try {
    quiet(() =>
      m._compile(
        `const __harnessReadOnly = globalThis.__engineHarnessReadOnly;${src}\n;module.exports.__internals = { generateCandidates, ` +
          `recordSpellPreviewMs: typeof recordSpellPreviewMs === "function" ? recordSpellPreviewMs : null, ` +
          `estimateSpellPreviewMs: typeof estimateSpellPreviewMs === "function" ? estimateSpellPreviewMs : null };\n`,
        ENGINE_FILE
      )
    );
  } finally {
    if (previousDebug === undefined) delete process.env.CPU_ENGINE_DEBUG;
    else process.env.CPU_ENGINE_DEBUG = previousDebug;
  }
  return m.exports;
}

function createReadOnly() {
  const violations = [];
  const cache = new WeakMap();
  const proxies = new WeakSet();
  const deny = (what) => (_target, key) => {
    violations.push(`${what} ${String(key)}`);
    throw new TypeError(`harness: in-place ${what} of shared engine data (${String(key)})`);
  };
  const handler = {
    get: (target, key, receiver) => wrap(Reflect.get(target, key, receiver)),
    set: deny("set"),
    deleteProperty: deny("delete"),
    defineProperty: deny("defineProperty"),
    setPrototypeOf: deny("setPrototypeOf"),
    preventExtensions: deny("preventExtensions"),
  };
  function wrap(value) {
    if (!value || typeof value !== "object" || proxies.has(value)) return value;
    let proxy = cache.get(value);
    if (!proxy) {
      proxy = new Proxy(value, handler);
      cache.set(value, proxy);
      proxies.add(proxy);
    }
    return proxy;
  }
  wrap.violations = violations;
  return wrap;
}

// ---------------------------------------------------------------------------
// Realistic state generation
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CPU_CARDS = require(path.join(DEPS_ROOT, "src/lib/game/cpu/cards.json"));
const RAW_CARDS = require(path.join(ROOT, "data/cards_raw.json"));
const cpuPool = (type) => Object.keys(CPU_CARDS).filter((n) => CPU_CARDS[n].type === type);
const rawPool = (type) =>
  RAW_CARDS.filter((c) => c && c.guardian && c.guardian.type === type && !CPU_CARDS[c.name]);
const POOLS = {
  site: cpuPool("Site"),
  minion: cpuPool("Minion"),
  magic: cpuPool("Magic"),
  aura: cpuPool("Aura"),
  artifact: cpuPool("Artifact"),
  avatar: cpuPool("Avatar"),
  caster: ["Apprentice Wizard", "Grandmaster Wizard", "Lava Salamander", "Spire Lich"],
  rawSite: rawPool("Site"),
  rawMinion: rawPool("Minion"),
  rawMagic: rawPool("Magic"),
};
const ADVERSARIAL_SPELLS = ["Chain Lightning", "Teleport", "Fireball", "Firebolts", "Major Explosion", "Lightning Bolt"];

function slugOf(name) {
  return `gen-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function cpuCard(name, instanceId) {
  const d = CPU_CARDS[name];
  return {
    name,
    slug: slugOf(name),
    type: d.type,
    cost: d.cost,
    attack: d.attack,
    defence: d.defence,
    thresholds: { ...d.thresholds },
    text: d.rulesText,
    cardId: 1,
    instanceId,
  };
}

function rawCard(entry, instanceId) {
  const g = entry.guardian;
  const variant = entry.sets && entry.sets[0] && entry.sets[0].variants && entry.sets[0].variants[0];
  return {
    name: entry.name,
    slug: (variant && variant.slug) || slugOf(entry.name),
    type: g.type,
    cost: g.cost,
    attack: g.attack,
    defence: g.defence,
    thresholds: g.thresholds || null,
    text: g.rulesText,
    cardId: 2,
    instanceId,
  };
}

function makeRandomState(index, seed) {
  const rng = mulberry32((seed * 1000003 + index * 7919) >>> 0);
  let serial = 0;
  const id = (prefix) => `${prefix}${index}_${serial++}`;
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p) => rng() < p;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const W = 5;
  const H = 4;
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push(`${x},${y}`);
  const dist = (a, b) => {
    const [ax, ay] = a.split(",").map(Number);
    const [bx, by] = b.split(",").map(Number);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  };
  const shuffled = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const seat = chance(0.5) ? "p1" : "p2";
  const myNum = seat === "p1" ? 1 : 2;
  const crowded = chance(0.1);
  const turnIndex = int(0, 10);
  // Half the states give the bot no untapped units: unit move candidates carry `__remove`
  // tombstones that make baseline search() throw while scoring (see report), so these states
  // keep the scoring/refinement paths covered.
  const idleUnits = chance(0.5);

  const siteCard = () => (chance(0.85) ? cpuCard(pick(POOLS.site), id("s")) : rawCard(pick(POOLS.rawSite), id("s")));
  const minionCard = () =>
    chance(0.12)
      ? cpuCard(pick(POOLS.caster), id("m"))
      : chance(0.8)
        ? cpuCard(pick(POOLS.minion), id("m"))
        : rawCard(pick(POOLS.rawMinion), id("m"));
  const magicCard = () => (chance(0.8) ? cpuCard(pick(POOLS.magic), id("g")) : rawCard(pick(POOLS.rawMagic), id("g")));
  const handCard = () => {
    const r = rng();
    const c =
      r < 0.25 ? siteCard() : r < 0.6 ? minionCard() : r < 0.9 ? magicCard() : r < 0.95 ? cpuCard(pick(POOLS.aura), id("a")) : cpuCard(pick(POOLS.artifact), id("r"));
    if (chance(0.04)) delete c.type; // exercises the cards_raw type fallback
    return c;
  };

  const sites = {};
  const homes = { 1: "2,3", 2: "2,0" };
  const earlyCap = turnIndex <= 3 ? 3 : 7;
  for (const owner of [1, 2]) {
    const count = crowded ? int(6, 10) : int(0, earlyCap);
    const ordered = shuffled(cells).sort((a, b) => dist(a, homes[owner]) - dist(b, homes[owner]));
    let placed = 0;
    for (const at of ordered) {
      if (placed >= count) break;
      if (sites[at]) continue;
      sites[at] = { owner, tapped: chance(0.15), card: siteCard() };
      placed++;
    }
  }
  if (chance(0.08)) {
    const empty = cells.filter((c) => !sites[c]);
    if (empty.length) sites[pick(empty)] = { owner: pick([1, 2]), tapped: false, cpuNeutral: true, card: { name: "Rubble", type: "Site", slug: "rubble", instanceId: id("n") } };
  }
  const siteCells = Object.keys(sites);

  const permanents = {};
  const permanentPositions = {};
  const unitCount = crowded ? int(22, 40) : chance(0.3) ? 0 : int(1, 14);
  for (let i = 0; i < unitCount; i++) {
    const at = siteCells.length && chance(0.9) ? pick(siteCells) : pick(cells);
    const owner = chance(0.5) ? 1 : 2;
    const card = minionCard();
    const item = { owner, card, instanceId: card.instanceId, tapped: (idleUnits && owner === myNum) || chance(0.25) };
    if (owner === myNum && chance(0.15)) item.summonedThisTurn = true;
    if (chance(0.15)) item.damage = int(1, 2);
    const stack = (permanents[at] = permanents[at] || []);
    stack.push(item);
    if (chance(0.05)) {
      const a = cpuCard(pick(POOLS.artifact), id("r"));
      stack.push({ owner, card: a, instanceId: a.instanceId, tapped: false, attachedTo: { at, index: stack.length - 1 } });
    }
    if (chance(0.04)) {
      permanentPositions[card.instanceId] = { state: pick(["burrowed", "submerged", "surface"]), position: { x: 0, y: 0, z: 0 } };
    }
  }
  if (chance(0.1) && siteCells.length) {
    const at = pick(siteCells);
    const aura = cpuCard(pick(POOLS.aura), id("a"));
    (permanents[at] = permanents[at] || []).push({ owner: pick([1, 2]), card: aura, instanceId: aura.instanceId, tapped: false });
  }

  const avatarFor = (owner) => {
    const own = siteCells.filter((k) => sites[k].owner === owner && !sites[k].cpuNeutral);
    const posKey = own.length && chance(0.25) ? pick(own) : homes[owner];
    const av = { pos: posKey.split(",").map(Number), tapped: chance(0.3) };
    if (chance(0.95)) av.card = cpuCard(pick(POOLS.avatar), id("v"));
    return av;
  };

  const zonesFor = (isMe) => {
    const handSize = isMe ? (crowded ? int(4, 9) : int(0, 8)) : int(0, 6);
    return {
      hand: Array.from({ length: handSize }, handCard),
      spellbook: Array.from({ length: int(0, 25) }, () => (chance(0.55) ? minionCard() : magicCard())),
      atlas: Array.from({ length: int(0, 12) }, siteCard),
      graveyard: Array.from({ length: int(0, 5) }, () => (chance(0.6) ? minionCard() : magicCard())),
      banished: [],
    };
  };

  const playerFor = () => {
    const life = chance(0.05) ? 0 : int(1, 20);
    return { life, lifeState: life === 0 ? "dd" : "alive", mana: chance(0.5) ? 0 : -int(1, 4) };
  };

  const state = {
    phase: "Main",
    currentPlayer: myNum,
    turn: Math.max(1, Math.ceil(turnIndex / 2)),
    turnIndex,
    cpuPreconRules: chance(0.5),
    board: { size: { w: W, h: H }, sites },
    permanents,
    permanentPositions,
    avatars: { p1: avatarFor(1), p2: avatarFor(2) },
    players: { p1: playerFor(), p2: playerFor() },
    zones: { p1: zonesFor(seat === "p1"), p2: zonesFor(seat === "p2") },
  };
  return { label: `random#${index}${crowded ? " crowded" : ""}`, seat, crowded, state: JSON.parse(JSON.stringify(state)) };
}

/** bench.js-style crowded board: many spellcasters and expensive spells in hand. */
function makeAdversarialState(variant) {
  const seat = variant % 2 === 0 ? "p1" : "p2";
  const myNum = seat === "p1" ? 1 : 2;
  const minions = variant === 2 ? 30 : 40;
  const casters = variant === 2 ? 8 : 20;
  const sites = {};
  const siteNames = ["Cloud City", "Arid Desert", "Spring River", "Humble Village"]; // air, fire, water, earth
  for (let i = 0; i < 20; i++) {
    const owner = variant === 1 && i % 4 === 3 ? 3 - myNum : myNum; // variant 1: opponent holds the earth sites
    sites[`${i % 5},${Math.floor(i / 5)}`] = { owner, tapped: false, card: cpuCard(siteNames[i % 4], `site${i}`) };
  }
  const bodies = ["Ogre Goons", "Pit Vipers", "Quarrelsome Kobolds", "Sacred Scarabs", "Rimland Nomads", "Petrosian Cavalry"];
  const casterNames = ["Apprentice Wizard", "Grandmaster Wizard"];
  const permanents = {};
  for (let i = 0; i < minions; i++) {
    const at = `${i % 5},${Math.floor(i / 5) % 4}`;
    const isCaster = i < casters;
    const card = cpuCard(isCaster ? casterNames[i % 2] : bodies[i % bodies.length], `u${i}`);
    const owner = isCaster ? myNum : i % 2 ? 1 : 2;
    // The bot's own units are tapped (spellcasting does not need them untapped) so the search
    // completes instead of hitting the baseline tombstone crash on unit moves.
    (permanents[at] = permanents[at] || []).push({ owner, card, instanceId: card.instanceId, tapped: owner === myNum });
  }
  const hand = [...ADVERSARIAL_SPELLS.map((n, i) => cpuCard(n, `h${i}`)), cpuCard("Ogre Goons", "h7"), cpuCard("Arid Desert", "h8")];
  const state = {
    phase: "Main",
    currentPlayer: myNum,
    turn: 5,
    turnIndex: 8,
    cpuPreconRules: variant !== 2,
    board: { size: { w: 5, h: 4 }, sites },
    permanents,
    permanentPositions: {},
    avatars: {
      p1: { card: cpuCard("Flamecaller", "av1"), pos: [2, 3], tapped: false },
      p2: { card: cpuCard("Geomancer", "av2"), pos: [2, 0], tapped: false },
    },
    players: { p1: { life: 20, lifeState: "alive", mana: 0 }, p2: { life: 20, lifeState: "alive", mana: 0 } },
    zones: {
      p1: { hand: seat === "p1" ? hand : [], graveyard: [], spellbook: [], atlas: [cpuCard("Arid Desert", "a1")], banished: [] },
      p2: { hand: seat === "p2" ? hand : [], graveyard: [], spellbook: [], atlas: [cpuCard("Arid Desert", "a2")], banished: [] },
    },
  };
  return { label: `adversarial#${variant} (${minions} minions, ${casters} casters, 6 spells)`, seat, crowded: true, adversarial: true, state: JSON.parse(JSON.stringify(state)) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const cloneJson = (x) => JSON.parse(JSON.stringify(x));

function searchOptions(index, logger) {
  const variant = index % 5;
  const options = {
    skipDrawThisTurn: variant !== 3,
    mode: variant === 4 ? "train" : "evaluate",
    exploration: { epsilon_root: variant === 4 ? 0.3 : 0 },
    seed: variant === 4 ? `seed-${index}` : undefined,
    rules: undefined,
  };
  if (logger) options.logger = logger;
  return options;
}

function run(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function thetaWith(engine, budgetMs) {
  const theta = engine.loadTheta();
  theta.search.budgetMs = budgetMs;
  return theta;
}

function stripTimes(entry) {
  const copy = { ...entry };
  delete copy.timeMs;
  delete copy.t;
  return copy;
}

/** Count objects reachable from `patch` that are the very same objects as in `input`. */
function aliasCount(patch, input) {
  const seen = new Set();
  const walk = (x, visit) => {
    if (!x || typeof x !== "object" || seen.has(x)) return;
    seen.add(x);
    visit(x);
    for (const k of Object.keys(x)) walk(x[k], visit);
  };
  const inputObjects = new Set();
  walk(input, (x) => inputObjects.add(x));
  seen.clear();
  let n = 0;
  walk(patch, (x) => {
    if (inputObjects.has(x)) n++;
  });
  return n;
}

function percentiles(values) {
  const s = [...values].sort((a, b) => a - b);
  const at = (p) => s[Math.max(0, Math.ceil(p * s.length) - 1)];
  return { p50: at(0.5), p95: at(0.95), max: s[s.length - 1] };
}

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));

/** `{}` (pass) or the endTurnPatch fallback: the bot client turns either into ending its turn. */
const isPassPatch = (p) => !!p && typeof p === "object" && Object.keys(p).every((k) => k === "currentPlayer" || k === "phase");

/** Invariants of one non-deterministic, evaluate-mode decision under any budget: every generated
 * candidate is scored (generation is already paid for), an untruncated search refines every root,
 * the chosen candidate is the best one the engine compares (only refined roots once refinement was
 * cut), and the summary line agrees with telemetry about truncation. */
function checkDecision(log, lines, label, maxDepth) {
  const cands = log.candidates || [];
  const generated = log.filteredCandidates ? log.filteredCandidates.candidatesAfterLimit : null;
  if (generated !== null && cands.length !== generated) fail(`${label}: scored ${cands.length} of ${generated} generated candidates`);
  const details = log.candidateDetails || [];
  if (!details.length || details[details.length - 1].action !== "pass") fail(`${label}: pass candidate was not scored`);
  const refined = cands.filter((c) => Number.isFinite(c.refined)).length;
  if (!log.deadlineTruncated && maxDepth >= 2 && refined !== cands.length) fail(`${label}: refined ${refined}/${cands.length} roots without a deadlineTruncated flag`);
  const refinedOnly = Boolean(log.deadlineTruncated) && refined > 0;
  const value = (c) => (Number.isFinite(c.refined) ? c.refined : c.score);
  const values = cands.filter((c) => !refinedOnly || Number.isFinite(c.refined)).map(value).filter(Number.isFinite);
  if (values.length) {
    const best = Math.max(...values);
    if (!log.chosen || value(log.chosen) !== best || (refinedOnly && !Number.isFinite(log.chosen.refined))) fail(`${label}: chosen ${JSON.stringify(log.chosen)} is not the best compared candidate (${best})`);
  }
  if (lines.length === 1 && Boolean(log.deadlineTruncated) !== lines[0].includes("deadline")) fail(`${label}: summary line and telemetry disagree about truncation`);
}

/** Slowest single getSpellChoices call for playable spells in hand (the largest unit of work
 * the engine cannot interrupt). */
function slowestSpellCall(entry) {
  const spells = require(path.join(DEPS_ROOT, "src/lib/game/cpu/spells.js"));
  const { state, seat } = entry;
  let worst = 0;
  for (const card of (state.zones[seat] && state.zones[seat].hand) || []) {
    if (!card || !spells.supportsSpell(card.name)) continue;
    const preview = { ...state, players: { ...state.players, [seat]: { ...state.players[seat], mana: (Number(state.players[seat].mana) || 0) - (Number(card.cost) || 0) } } };
    const t0 = process.hrtime.bigint();
    quiet(() => run(() => spells.getSpellChoices(preview, seat, card.name)));
    worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const baselineSource = execFileSync("git", ["show", `${BASELINE_REF}:bots/engine/index.js`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const candidateSource = fs.readFileSync(SOURCE_ENGINE_FILE, "utf8");
  const baseline = compileEngine(baselineSource);
  const candidate = compileEngine(candidateSource);
  const candidateDebug = compileEngine(candidateSource, { debug: true });
  const readOnly = createReadOnly();
  const candidateReadOnly = compileEngine(candidateSource, { readOnly });

  const states = [];
  for (let i = 0; i < STATE_COUNT; i++) states.push(makeRandomState(i, SEED));
  const adversarial = [0, 1, 2].map(makeAdversarialState);
  out(`engine-search-budget: ${states.length} random states (seed ${SEED}, ${states.filter((s) => s.crowded).length} crowded) + ${adversarial.length} adversarial; baseline ${BASELINE_REF}; CPU helpers ${DEPS_REF ? `${DEPS_REF} (${DEPS_ROOT})` : "working tree"}`);
  const report = { states: states.length, seed: SEED, baselineRef: BASELINE_REF, depsRef: DEPS_REF || "working tree" };

  // (a) + (b): immutability and equivalence with the deadline disabled
  if (!hasFlag("skip-equivalence")) {
    const t0 = Date.now();
    const counts = { patchEqual: 0, telemetryEqual: 0, candidatesEqual: 0, deterministic: 0, errorsBoth: 0, logLinesMax: 0 };
    states.forEach((entry, i) => {
      const { state, seat, label } = entry;
      const snapshotJson = JSON.stringify(state);
      const snapshot = structuredClone(state);
      const unchanged = (what) => {
        if (JSON.stringify(state) !== snapshotJson || !util.isDeepStrictEqual(state, snapshot)) fail(`${label}: ${what} mutated its input state`);
      };

      // Chosen patch, no logger (production path)
      const baseInput = cloneJson(state);
      const base = quiet(() => run(() => baseline.search(baseInput, seat, thetaWith(baseline, HUGE_BUDGET_MS), baseline.createRng(`eq|${i}`), searchOptions(i))));
      const lines = [];
      const cand = quiet(() => run(() => candidate.search(state, seat, thetaWith(candidate, HUGE_BUDGET_MS), candidate.createRng(`eq|${i}`), searchOptions(i))), lines);
      unchanged("search()");
      counts.logLinesMax = Math.max(counts.logLinesMax, lines.length);
      if (lines.length > 1) fail(`${label}: ${lines.length} console lines for one decision`);
      if (JSON.stringify(base) === JSON.stringify(cand)) counts.patchEqual++;
      else fail(`${label}: chosen patch differs from baseline\n    base=${JSON.stringify(base).slice(0, 300)}\n    cand=${JSON.stringify(cand).slice(0, 300)}`);
      if (!base.ok && !cand.ok) counts.errorsBoth++;
      if (base.ok && cand.ok) {
        const a1 = aliasCount(base.value, baseInput);
        const a2 = aliasCount(cand.value, state);
        if (a1 !== a2) fail(`${label}: returned patch aliases ${a2} input objects (baseline ${a1})`);
      }

      // Telemetry entry (train-mode logger path) must match too
      const baseLog = [];
      const candLog = [];
      quiet(() => run(() => baseline.search(cloneJson(state), seat, thetaWith(baseline, HUGE_BUDGET_MS), baseline.createRng(`log|${i}`), searchOptions(i, (e) => baseLog.push(stripTimes(e))))));
      quiet(() => run(() => candidate.search(state, seat, thetaWith(candidate, HUGE_BUDGET_MS), candidate.createRng(`log|${i}`), searchOptions(i, (e) => candLog.push(stripTimes(e))))));
      unchanged("search() with logger");
      if (baseLog.length === 1 && baseLog[0].deterministic) counts.deterministic++;
      if (JSON.stringify(baseLog) === JSON.stringify(candLog)) counts.telemetryEqual++;
      else fail(`${label}: telemetry differs\n    base=${JSON.stringify(baseLog).slice(0, 400)}\n    cand=${JSON.stringify(candLog).slice(0, 400)}`);

      // generateCandidates: same list, no mutation
      let sameCandidates = true;
      for (const skipDrawThisTurn of [true, false]) {
        const g1 = quiet(() => run(() => baseline.__internals.generateCandidates(cloneJson(state), seat, { skipDrawThisTurn, collectStats: true })));
        const g2 = quiet(() => run(() => candidate.__internals.generateCandidates(state, seat, { skipDrawThisTurn, collectStats: true })));
        unchanged("generateCandidates()");
        if (JSON.stringify(g1) !== JSON.stringify(g2)) {
          sameCandidates = false;
          fail(`${label}: generateCandidates(skipDraw=${skipDrawThisTurn}) differs from baseline`);
        }
      }
      if (sameCandidates) counts.candidatesEqual++;

      // Read-only proxies around the input and every engine-produced state/patch
      readOnly.violations.length = 0;
      const ro = quiet(() => run(() => candidateReadOnly.search(readOnly(state), seat, thetaWith(candidateReadOnly, HUGE_BUDGET_MS), candidateReadOnly.createRng(`eq|${i}`), searchOptions(i))));
      quiet(() => run(() => candidateReadOnly.__internals.generateCandidates(readOnly(state), seat, { skipDrawThisTurn: false })));
      if (readOnly.violations.length) fail(`${label}: in-place writes to shared data: ${[...new Set(readOnly.violations)].slice(0, 5).join(", ")}`);
      if (JSON.stringify(ro) !== JSON.stringify(cand)) fail(`${label}: read-only instrumented run chose a different patch`);

      // CPU_ENGINE_DEBUG=1 must not change decisions (only the first 40 states: very chatty)
      if (i < 40) {
        const dbg = quiet(() => run(() => candidateDebug.search(state, seat, thetaWith(candidateDebug, HUGE_BUDGET_MS), candidateDebug.createRng(`eq|${i}`), searchOptions(i))));
        if (JSON.stringify(dbg) !== JSON.stringify(cand)) fail(`${label}: CPU_ENGINE_DEBUG=1 changed the decision`);
      }
      if ((i + 1) % 50 === 0) out(`  ... ${i + 1}/${states.length} states checked (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    });
    report.equivalence = { ...counts, seconds: Math.round((Date.now() - t0) / 1000) };
    out(`equivalence (budgetMs=${HUGE_BUDGET_MS}): patch ${counts.patchEqual}/${states.length}, telemetry ${counts.telemetryEqual}/${states.length}, generateCandidates ${counts.candidatesEqual}/${states.length}; deterministic decisions ${counts.deterministic}, errors in both ${counts.errorsBoth}, max console lines/decision ${counts.logLinesMax}`);
  }

  // Tight budget (budgetMs=1, 2 ms hard deadline): nearly every decision is cut short, yet each one
  // must return a patch, keep deterministic priority, log one line, score every generated candidate
  // (pass included), choose the best compared candidate and flag the truncation in telemetry.
  if (!hasFlag("skip-tight")) {
    const counts = { comparable: 0, returned: 0, truncated: 0, deterministicSame: 0, baselineActedCandidatePassed: 0 };
    const maxDepth = candidate.loadTheta().search.maxDepth;
    [...states, ...adversarial].forEach((entry) => {
      const baseLog = [];
      const base = quiet(() => run(() => baseline.search(cloneJson(entry.state), entry.seat, thetaWith(baseline, HUGE_BUDGET_MS), null, searchOptions(1, (e) => baseLog.push(e)))));
      if (!base.ok) return;
      counts.comparable++;
      const lines = [];
      const logs = [];
      const cand = quiet(() => run(() => candidate.search(cloneJson(entry.state), entry.seat, thetaWith(candidate, 1), null, searchOptions(1, (e) => logs.push(e)))), lines);
      if (!cand.ok || !cand.value || typeof cand.value !== "object") {
        fail(`${entry.label}: tight budget returned ${cand.ok ? JSON.stringify(cand.value) : `an error: ${cand.error}`}`);
        return;
      }
      counts.returned++;
      if (lines.length > 1) fail(`${entry.label}: tight budget logged ${lines.length} lines`);
      const log = logs[0] || {};
      if (baseLog[0] && baseLog[0].deterministic) {
        if (log.deterministic && JSON.stringify(cand.value) === JSON.stringify(base.value)) counts.deterministicSame++;
        else fail(`${entry.label}: deterministic action lost its priority under a tight budget`);
        return;
      }
      if (log.deadlineTruncated) counts.truncated++;
      if (isPassPatch(cand.value) && !isPassPatch(base.value)) counts.baselineActedCandidatePassed++;
      checkDecision(log, lines, `${entry.label} (budgetMs=1)`, maxDepth);
    });
    report.tightBudget = counts;
    out(`tight budget (budgetMs=1): ${counts.returned}/${counts.comparable} decisions returned a patch, ${counts.truncated} truncated, ${counts.deterministicSame} deterministic unchanged, ${counts.baselineActedCandidatePassed} passed where the baseline acted`);
  }

  // Virtual clock: Date.now() advances 1 ms per call, so across these budgets the deadline lands in
  // every stage of search() (generation, spell previews, scoring, refinement). Deterministic. Besides
  // the per-decision invariants, a decision that was not truncated must equal the baseline's.
  if (!hasFlag("skip-sweep")) {
    const sweepEngine = compileEngine(candidateSource); // empty spell preview cost memory
    const maxDepth = sweepEngine.loadTheta().search.maxDepth;
    const budgets = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
    const counts = { decisions: 0, truncated: 0, untruncatedSameAsBaseline: 0, truncatedPass: 0, truncatedPassBaselineActed: 0 };
    const realNow = Date.now;
    const sweepStates = [...states.filter((_, i) => i % 3 === 0), ...adversarial];
    sweepStates.forEach((entry, i) => {
      const options = (logger) => searchOptions(i % 4, logger); // variants 0-3: evaluate mode, draw on/off
      const baseLog = [];
      const base = quiet(() => run(() => baseline.search(cloneJson(entry.state), entry.seat, thetaWith(baseline, HUGE_BUDGET_MS), null, options((e) => baseLog.push(e)))));
      if (!base.ok) return;
      // Root candidates built even with the deadline already expired (units, moves, sites, pass):
      // no decision may consider fewer.
      const minimum = quiet(() => run(() => sweepEngine.__internals.generateCandidates(cloneJson(entry.state), entry.seat, { ...options(), budget: { deadline: 0, cut: false }, alwaysBuildCheapCandidates: true })));
      const minimumCount = minimum.ok ? minimum.value.length : 1;
      for (const budgetMs of budgets) {
        const label = `${entry.label} (virtual clock, budgetMs=${budgetMs})`;
        const lines = [];
        const logs = [];
        const origin = realNow();
        let calls = 0;
        Date.now = () => origin + calls++;
        let cand;
        try {
          cand = quiet(() => run(() => sweepEngine.search(cloneJson(entry.state), entry.seat, thetaWith(sweepEngine, budgetMs), null, options((e) => logs.push(e)))), lines);
        } finally {
          Date.now = realNow;
        }
        counts.decisions++;
        if (!cand.ok || !cand.value || typeof cand.value !== "object") {
          fail(`${label}: returned ${cand.ok ? JSON.stringify(cand.value) : `an error: ${cand.error}`}`);
          continue;
        }
        if (lines.length > 1) fail(`${label}: logged ${lines.length} lines`);
        const log = logs[0] || {};
        if (baseLog[0] && baseLog[0].deterministic) {
          if (!log.deterministic || JSON.stringify(cand.value) !== JSON.stringify(base.value)) fail(`${label}: deterministic action lost its priority`);
          continue;
        }
        checkDecision(log, lines, label, maxDepth);
        const generatedCount = log.filteredCandidates ? log.filteredCandidates.candidatesAfterLimit : 0;
        if (generatedCount < minimumCount) fail(`${label}: considered ${generatedCount} candidates, fewer than the ${minimumCount} built with an expired deadline`);
        if (!log.deadlineTruncated) {
          if (JSON.stringify(cand.value) === JSON.stringify(base.value)) counts.untruncatedSameAsBaseline++;
          else fail(`${label}: untruncated decision differs from the baseline`);
          continue;
        }
        counts.truncated++;
        if (isPassPatch(cand.value)) {
          counts.truncatedPass++;
          if (!isPassPatch(base.value)) counts.truncatedPassBaselineActed++;
        }
      }
    });
    report.virtualClockSweep = counts;
    out(`virtual-clock sweep (${sweepStates.length} states x ${budgets.length} budgets): ${counts.decisions} decisions, ${counts.truncated} truncated (${counts.truncatedPass} chose pass, ${counts.truncatedPassBaselineActed} where the baseline acted), ${counts.untruncatedSameAsBaseline} untruncated equal to baseline`);
  }

  // Spell preview gating (deterministic): within one search budget, a preview whose recorded cost
  // would end past the deadline is skipped (budget.cut set, cheaper groups and pass kept); a spell
  // with no measurement in that budget is previewed; measurements never carry over to another budget.
  if (!hasFlag("skip-gating")) {
    const gated = compileEngine(candidateSource);
    const I = gated.__internals;
    const entry = adversarial[0];
    const hand = entry.state.zones[entry.seat].hand.filter((c) => /magic|sorcery|aura/i.test(String(c.type)));
    const genOptions = (budget) => ({ skipDrawThisTurn: true, collectStats: true, budget });
    const ungated = quiet(() => I.generateCandidates(entry.state, entry.seat, genOptions({ deadline: Date.now() + HUGE_BUDGET_MS, cut: false })));
    const budget = { deadline: Date.now() + 5000, cut: false };
    for (const card of hand) I.recordSpellPreviewMs(budget, card, 10000);
    const t0 = Date.now();
    const skipped = quiet(() => I.generateCandidates(entry.state, entry.seat, genOptions(budget)));
    const tookMs = Date.now() - t0;
    const spellCount = ungated.candidates.length - skipped.candidates.length;
    if (!budget.cut) fail("gating: a preview predicted to end past the deadline did not set budget.cut");
    if (spellCount <= 0) fail(`gating: no spell candidate was skipped (${ungated.candidates.length} vs ${skipped.candidates.length})`);
    if (!skipped.candidates.length || JSON.stringify(skipped.candidates[skipped.candidates.length - 1]) !== "{}") fail("gating: pass candidate missing after skipping previews");
    if (tookMs > 1000) fail(`gating: skipping previews still took ${tookMs}ms`);
    const fresh = { deadline: Date.now() + 5000, cut: false };
    if (I.estimateSpellPreviewMs(fresh, hand[0]) !== 0) fail("gating: a measurement leaked into another search budget");
    const freshRun = quiet(() => I.generateCandidates(entry.state, entry.seat, genOptions(fresh)));
    if (freshRun.candidates.length !== ungated.candidates.length) fail(`gating: an earlier budget's measurements hid spell candidates (${freshRun.candidates.length} vs ${ungated.candidates.length})`);
    if (I.estimateSpellPreviewMs(fresh, { name: "Never Previewed" }) !== 0) fail("gating: a spell without a measurement is estimated");
    report.gating = { spellCandidatesSkipped: spellCount, tookMs };
    out(`spell preview gating: ${spellCount} spell candidates skipped on ${entry.label} in ${tookMs}ms; ungated ${ungated.candidates.length} candidates`);
  }

  // (c): wall time before/after and the deadline ceiling
  if (!hasFlag("skip-timing")) {
    const all = [...states, ...adversarial];
    const configs = [
      { name: "default theta", budgetMs: baseline.loadTheta().search.budgetMs },
      { name: "budgetMs=20", budgetMs: 20 },
    ];
    report.timing = {};
    // Warm up both engines' JIT on a slice of the states.
    for (const entry of states.slice(0, 20)) {
      quiet(() => run(() => baseline.search(cloneJson(entry.state), entry.seat, baseline.loadTheta(), null, searchOptions(0))));
      quiet(() => run(() => candidate.search(cloneJson(entry.state), entry.seat, candidate.loadTheta(), null, searchOptions(0))));
    }
    for (const config of configs) {
      const deadlineMs = 2 * config.budgetMs;
      // A fresh engine per config (empty spell preview cost memory): its first decision on a board may
      // run a preview it has never measured; the repeat decision on the same board can skip previews
      // predicted to overrun, which is the steady state of a long-running bot process.
      const fresh = compileEngine(candidateSource);
      const rows = [];
      for (const entry of all) {
        const time = (engine, sink) => {
          const input = cloneJson(entry.state);
          const theta = thetaWith(engine, config.budgetMs);
          const t0 = process.hrtime.bigint();
          const result = quiet(() => run(() => engine.search(input, entry.seat, theta, null, searchOptions(1))), sink);
          return { ms: Number(process.hrtime.bigint() - t0) / 1e6, ok: result.ok, value: result.ok ? result.value : null };
        };
        const lines = [];
        const cand = time(fresh, lines);
        const repeatLines = [];
        const repeat = time(fresh, repeatLines);
        const base = time(baseline);
        const passedWhereBaselineActed = (r) => r.ok && base.ok && isPassPatch(r.value) && !isPassPatch(base.value);
        rows.push({
          entry,
          baseMs: base.ms,
          candMs: cand.ms,
          repeatMs: repeat.ms,
          baseOk: base.ok,
          candOk: cand.ok && repeat.ok,
          truncated: lines.some((l) => l.includes("deadline")),
          repeatTruncated: repeatLines.some((l) => l.includes("deadline")),
          candPassed: passedWhereBaselineActed(cand),
          repeatPassed: passedWhereBaselineActed(repeat),
        });
      }
      const base = percentiles(rows.map((r) => r.baseMs));
      const cand = percentiles(rows.map((r) => r.candMs));
      const repeat = percentiles(rows.map((r) => r.repeatMs));
      const advRows = rows.filter((r) => r.entry.adversarial);
      const overshoots = [];
      for (const r of rows) {
        for (const [pass, ms] of [["first", r.candMs], ["repeat", r.repeatMs]]) {
          const over = ms - deadlineMs;
          if (over <= 25) continue;
          const unit = slowestSpellCall(r.entry);
          const allowance = Math.max(25, 1.5 * unit + 15);
          overshoots.push({ label: r.entry.label, pass, candMs: ms, over, slowestSpellMs: unit, allowance });
          if (over > allowance) fail(`${config.name}: ${r.entry.label} (${pass} decision) took ${fmt(ms)}ms (deadline ${deadlineMs}ms, slowest single spell call ${fmt(unit)}ms)`);
        }
      }
      const completed = rows.filter((r) => r.baseOk && r.candOk);
      const summary = {
        deadlineMs,
        baseline: base,
        candidate: cand,
        candidateRepeat: repeat,
        completedOnly: { decisions: completed.length, baseline: percentiles(completed.map((r) => r.baseMs)), candidate: percentiles(completed.map((r) => r.candMs)), candidateRepeat: percentiles(completed.map((r) => r.repeatMs)) },
        threw: { baseline: rows.filter((r) => !r.baseOk).length, candidate: rows.filter((r) => !r.candOk).length },
        truncatedDecisions: rows.filter((r) => r.truncated).length,
        repeatTruncatedDecisions: rows.filter((r) => r.repeatTruncated).length,
        baselineOverDeadline: rows.filter((r) => r.baseMs > deadlineMs).length,
        candidateOverDeadline: rows.filter((r) => r.candMs > deadlineMs).length,
        repeatOverDeadline: rows.filter((r) => r.repeatMs > deadlineMs).length,
        passedWhereBaselineActed: { first: rows.filter((r) => r.candPassed).map((r) => r.entry.label), repeat: rows.filter((r) => r.repeatPassed).map((r) => r.entry.label) },
        adversarial: advRows.map((r) => ({ label: r.entry.label, baseMs: Math.round(r.baseMs), candMs: Math.round(r.candMs), repeatMs: Math.round(r.repeatMs) })),
        overshoots: overshoots.map((o) => ({ ...o, candMs: Math.round(o.candMs), over: Math.round(o.over), slowestSpellMs: Math.round(o.slowestSpellMs) })),
      };
      report.timing[config.name] = summary;
      out(`timing ${config.name} (hard deadline ${deadlineMs}ms, ${rows.length} decisions):`);
      out(`  baseline          p50 ${fmt(base.p50)}  p95 ${fmt(base.p95)}  max ${fmt(base.max)} ms  (${summary.baselineOverDeadline} over deadline)`);
      out(`  candidate (first) p50 ${fmt(cand.p50)}  p95 ${fmt(cand.p95)}  max ${fmt(cand.max)} ms  (${summary.candidateOverDeadline} over deadline, ${summary.truncatedDecisions} truncated, ${summary.passedWhereBaselineActed.first.length} passed where baseline acted)`);
      out(`  candidate (repeat) p50 ${fmt(repeat.p50)}  p95 ${fmt(repeat.p95)}  max ${fmt(repeat.max)} ms  (${summary.repeatOverDeadline} over deadline, ${summary.repeatTruncatedDecisions} truncated, ${summary.passedWhereBaselineActed.repeat.length} passed where baseline acted)`);
      const c = summary.completedOnly;
      out(`  completed-only (${c.decisions}): baseline p50 ${fmt(c.baseline.p50)} p95 ${fmt(c.baseline.p95)} max ${fmt(c.baseline.max)} | first p50 ${fmt(c.candidate.p50)} p95 ${fmt(c.candidate.p95)} max ${fmt(c.candidate.max)} | repeat p50 ${fmt(c.candidateRepeat.p50)} p95 ${fmt(c.candidateRepeat.p95)} max ${fmt(c.candidateRepeat.max)} ms; threw: baseline ${summary.threw.baseline}, candidate ${summary.threw.candidate}`);
      for (const a of summary.adversarial) out(`  ${a.label}: baseline ${a.baseMs}ms -> first ${a.candMs}ms, repeat ${a.repeatMs}ms`);
      for (const o of summary.overshoots) out(`  overshoot ${o.label} (${o.pass}): ${o.candMs}ms (+${o.over}ms; slowest single spell call ${o.slowestSpellMs}ms)`);
    }
  }

  const jsonPath = argValue("json", null);
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify({ ...report, failures }, null, 2));
  out(failures.length ? `FAILED: ${failures.length} check(s)` : "OK: all checks passed");
  process.exit(failures.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { makeRandomState, makeAdversarialState, compileEngine, createReadOnly, searchOptions };
