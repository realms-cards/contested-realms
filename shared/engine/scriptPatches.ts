import { disableUntilYourNextTurn } from "../../vendor/untested-realm/shared/src/cards/scripts/multi-card-utils/disable-until-next-turn";
import { carryAlongPath, surfaceSweepPath } from "../../vendor/untested-realm/shared/src/cards/scripts/multi-card-utils/surface-sweep";
import { getScript } from "../../vendor/untested-realm/shared/src/index";
import type { EffectAPI } from "../../vendor/untested-realm/shared/src/index";

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
 * Current patches: Avalanche flows one step (below). Everything that used to be worked around
 * here before that is fixed in the vendored engine: either upstream (0.5.0: the Waveshaper untap lock, Break Stealth abilities;
 * 0.5.1: Waveshaper on already-flooded sites) or on our fork's `realms` branch, pending upstream
 * PRs (Sea Raider, The Manor at Daperyll Hill, Slimy Mutants / Sir Gareth, Waveshaper keeping a
 * permanently flooded site wet). A runtime patch is a stopgap: put the
 * real fix on a fork branch (scripts/untested-realm-fork.sh) and delete the patch once it is
 * vendored. Earlier patches in git history show the wrapping patterns (conts, abilities,
 * handAbilities), each marked with Symbol.for("realms.engine-mode.scriptPatch") so a re-run is a
 * no-op.
 */

/** Symbol.for so a re-executed module (HMR) still recognises its own earlier wrapper. */
const PATCHED = Symbol.for("realms.engine-mode.scriptPatch");

type TrapEffect = ((ctx: EffectAPI) => void) & { [PATCHED]?: true };

/*
 * Avalanche — "Trap (2) → Snow flows forward, carrying and disabling surface units until your
 * next turn." RULES INTERPRETATION (ours, 2026-11-17; no FAQ yet): the snow flows ONE step, from
 * the trap site to the location in front of it. Vendor avalanche.ts flows on to the edge or the
 * void like Rolling Boulder, but the cards that go that far say so ("rolls as far as possible",
 * When the Peaks Fell's "carrying them as far as possible") and Avalanche does not. Everything
 * else is the vendor's: forward is away from the springer's side, surface units on the trap site
 * are carried along (one that can't enter the next site stays put), and every unit the snow
 * reaches — on the trap site and the square in front — is disabled until the springer's next turn.
 * Raise upstream with the PR for it; DELETE once vendored.
 */
function avalancheOneStep(): boolean {
  const ability = getScript("Avalanche")?.siteTrapAbility;
  const original = ability?.effect as TrapEffect | undefined;
  if (!ability || !original || original[PATCHED]) return false;
  const patched: TrapEffect = (ctx) => {
    const site = ctx.state.sites[ctx.sourceId];
    if (!site) return;
    const forward = ctx.controller === 0 ? 1 : -1;
    const path = surfaceSweepPath(ctx.state, { x: site.x, y: site.y }, { dx: 0, dy: forward }, false).slice(0, 2);
    const swept = carryAlongPath(ctx, path);
    for (const u of swept) disableUntilYourNextTurn(ctx, u.id, ctx.controller);
    ctx.log(`❄ An avalanche sweeps ${swept.length} unit${swept.length === 1 ? "" : "s"} away!`);
  };
  patched[PATCHED] = true;
  ability.effect = patched;
  return true;
}

/** Applies every patch; idempotent (import side effect, exported for tests). */
export function applyScriptPatches(): void {
  avalancheOneStep();
}

applyScriptPatches();
