import { effKeywords, getKeywords, getScript, siteAt, unitsAt } from "../../vendor/untested-realm/shared/src/index";
import type { CardScript, EffectAPI, UnitState } from "../../vendor/untested-realm/shared/src/index";

/**
 * Local fixes to vendored card scripts, applied to the LIVE script registry on import.
 * Side-effect module: import it wherever the engine runs (session, bot worker, legal worker) so the
 * human, the CPU and the legal-move generator all play by the same rules. Never edit vendor/.
 *
 * It lives in shared/ because in a player-vs-player match the engine runs on the SERVER, which
 * cannot import from src/. Left behind in src/, PvP would silently play by the unpatched vendor
 * rules while single player plays by these — the same card behaving differently by mode. The
 * server's engine worker imports it for exactly that reason. The engine is reached by relative
 * path because tsc does not rewrite path aliases into the CommonJS the server build emits.
 *
 * Waveshaper — WORKAROUND for vendor cards/scripts/gen/waveshaper.ts:45 (`&& !u.tapped`): only
 * minions the wave actually taps get `skipUntap`, so an already-tapped minion (it moved or attacked
 * last turn, or the previous wave's marker was just consumed) untaps as normal and the FAQ3
 * re-wave lock never holds. Sir Tristan and Blasphemy set the marker unconditionally.
 * DELETE this patch once the upstream fix is vendored (scripts/vendor-untested-realm.sh).
 */

type ContFn = NonNullable<CardScript["conts"]>[string];

/** Symbol.for so a re-executed module (HMR) still recognises its own earlier wrapper. */
const PATCHED = Symbol.for("realms.engine-mode.scriptPatch");

type Marked = ContFn & { [PATCHED]?: true };

function isSquare(v: unknown): v is { x: number; y: number } {
  if (typeof v !== "object" || v === null) return false;
  const s = v as { x?: unknown; y?: unknown };
  return typeof s.x === "number" && typeof s.y === "number";
}

/** Wraps `script.conts[key]` once; a second import (or HMR re-run) finds the marker and skips. */
function wrapCont(name: string, key: string, wrap: (original: ContFn) => ContFn): boolean {
  const conts = getScript(name)?.conts;
  const original = conts?.[key] as Marked | undefined;
  if (!conts || !original || original[PATCHED]) return false;
  const patched: Marked = wrap(original);
  patched[PATCHED] = true;
  conts[key] = patched;
  return true;
}

/** a minion the wave holds down: the same test the vendor script uses, minus the tapped guard */
const waveHolds = (u: UnitState) => !u.isAvatar && !getKeywords(u.name).submerge;

const waveshaperWave = (original: ContFn): ContFn => (ctx: EffectAPI, contCtx: unknown, choice: unknown) => {
  const site = isSquare(choice) ? siteAt(ctx.state, choice.x, choice.y) : null;
  // the targets are whoever stood there when the wave hit — collected before the original runs
  const before = new Set(site ? unitsAt(ctx.state, site.x, site.y, "surface").filter(waveHolds).map((u) => u.id) : []);
  original(ctx, contCtx, choice);
  const flooded = site ? ctx.state.sites[site.id] : undefined;
  if (!flooded) return;
  // re-read after floodSite (it may move or kill units); the original already logged the ones it tapped
  for (const u of unitsAt(ctx.state, flooded.x, flooded.y, "surface")) {
    if (!before.has(u.id) || !waveHolds(u)) continue;
    u.tapped = true;
    u.counters = { ...u.counters, skipUntap: 1 };
  }
};

/*
 * Break Stealth → … — WORKAROUND for vendor engine/game.ts (activate): activating ANY minion
 * ability strips its Stealth before the effect runs, so Frozen Horror and Asmodeus, whose effects
 * open with `if (!self.stealth) return`, always fizzle ("No Stealth to break."). The patch offers
 * the ability only while the minion is stealthed and hands the effect back the Stealth the engine
 * just took, so the original breaks it itself and resolves. DELETE once fixed upstream.
 */
type Ability = NonNullable<CardScript["abilities"]>[number];
type MarkedAbility = Ability & { [PATCHED]?: true };

function wrapBreakStealth(name: string, key: string): boolean {
  const abilities = getScript(name)?.abilities;
  const index = abilities?.findIndex((a) => a.key === key) ?? -1;
  const original = abilities?.[index] as MarkedAbility | undefined;
  if (!abilities || !original || original[PATCHED]) return false;
  const patched: MarkedAbility = {
    ...original,
    available: (state, sourceId) =>
      state.units[sourceId]?.stealth === true && (original.available?.(state, sourceId) ?? true),
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId];
      if (self) self.stealth = true;
      return original.effect(ctx);
    },
  };
  patched[PATCHED] = true;
  abilities[index] = patched;
  return true;
}

/*
 * Slimy Mutants — WORKAROUND for vendor cards/scripts/gen/slimy-mutants.ts: the hand ability is
 * offered whenever ③ is affordable, even with no submerging ally to transform, and then spends the
 * mana for nothing ("No submerging ally to mutate."). Offer it only while such an ally exists.
 * DELETE once fixed upstream.
 */
type HandAbilities = NonNullable<CardScript["handAbilities"]> & { [PATCHED]?: true };

function gateSlimyMutants(): boolean {
  const script = getScript("Slimy Mutants");
  const original = script?.handAbilities as HandAbilities | undefined;
  if (!script || !original || original[PATCHED]) return false;
  const patched: HandAbilities = (state, cardId, owner) =>
    Object.values(state.units).some((u) => u.controller === owner && !u.isAvatar && effKeywords(state, u).submerge)
      ? original(state, cardId, owner)
      : [];
  patched[PATCHED] = true;
  script.handAbilities = patched;
  return true;
}

/** Applies every patch; idempotent (import side effect, exported for tests). */
export function applyScriptPatches(): void {
  wrapCont("Waveshaper", "wave", waveshaperWave);
  wrapBreakStealth("Frozen Horror", "terror");
  wrapBreakStealth("Asmodeus", "immolate");
  gateSlimyMutants();
}

applyScriptPatches();
