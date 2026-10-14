import { getKeywords, getScript, siteAt, unitsAt } from "@sorcery/shared";
import type { CardScript, EffectAPI, UnitState } from "@sorcery/shared";

/**
 * Local fixes to vendored card scripts, applied to the LIVE script registry on import.
 * Side-effect module: import it wherever the engine runs (session, bot worker, legal worker) so the
 * human, the CPU and the legal-move generator all play by the same rules. Never edit vendor/.
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

/** Applies every patch; idempotent (import side effect, exported for tests). */
export function applyScriptPatches(): void {
  wrapCont("Waveshaper", "wave", waveshaperWave);
}

applyScriptPatches();
