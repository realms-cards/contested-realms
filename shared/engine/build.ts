import upstream from "../../vendor/untested-realm/UPSTREAM.json";

/**
 * Which rules a client and the server are running, so a player-vs-player match can refuse to
 * pair two different ones.
 *
 * The client and the server are deployed separately, so for a while after a release one can
 * be on new rules and the other on old. The server is authoritative, but the client builds the
 * actions the player picks and paints the views it is sent; across two builds the two halves
 * disagree about what a card does, and the result looks like the game misbehaving.
 *
 * The id is the vendored engine commit plus a revision for OUR engine code in shared/engine
 * (the card-script patches, the legal-move generator, deck conversion) — a deploy that changes
 * neither keeps the same id, so an unrelated release does not force anyone to reload.
 */

/**
 * Bump whenever shared/engine changes, then update ENGINE_RULES_FINGERPRINT. Enforced by
 * tests/server/engine-build.test.ts, which fails when the files no longer match it.
 */
export const ENGINE_RULES_REVISION = 6;

/** sha256 (first 16 hex) of shared/engine/*.ts, build.ts and tests excluded, at this revision. */
export const ENGINE_RULES_FINGERPRINT = "32151d88686936e3";

export const ENGINE_BUILD = `${upstream.commit.slice(0, 12)}.r${ENGINE_RULES_REVISION}`;
