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
 * There are no patches right now. Everything that used to be worked around here is fixed in the
 * vendored engine: either upstream (0.5.0: the Waveshaper untap lock, Break Stealth abilities;
 * 0.5.1: Waveshaper on already-flooded sites) or on our fork's `realms` branch, pending upstream
 * PRs (Sea Raider, The Manor at Daperyll Hill, Slimy Mutants / Sir Gareth, Waveshaper keeping a
 * permanently flooded site wet). A runtime patch is a stopgap: put the
 * real fix on a fork branch (scripts/untested-realm-fork.sh) and delete the patch once it is
 * vendored. Earlier patches in git history show the wrapping patterns (conts, abilities,
 * handAbilities), each marked with Symbol.for("realms.engine-mode.scriptPatch") so a re-run is a
 * no-op.
 */

/** Applies every patch; idempotent (import side effect, exported for tests). */
export function applyScriptPatches(): void {
  // nothing to patch
}

applyScriptPatches();
