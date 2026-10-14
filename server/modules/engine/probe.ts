/**
 * Can this server build, load and run the vendored rules engine?
 *
 * Engine mode is single-player today: the whole game runs in one browser tab. Putting it into
 * player-vs-player needs ONE authority both players trust, and it has to be the server — a
 * client cannot generate its own legal moves, because the generator trial-applies candidate
 * actions against a full GameState and a redacted PlayerView has no seed and no id counter.
 *
 * That makes "can the server run the engine at all, in production" the question everything
 * else rests on, so this probe answers it on its own, before any of it is built.
 *
 * The engine is imported by RELATIVE path on purpose. The `@sorcery/shared` alias is inherited
 * from the root tsconfig and type-checks here, and `tsx` resolves it in dev — but `tsc` does
 * not rewrite path aliases when it emits CommonJS and there is no node_modules/@sorcery, so the
 * alias would work all the way through development and fail only in the production image.
 */
import { applyAction, createGame, viewFor } from "../../../vendor/untested-realm/shared/src/index";

type Timing = { label: string; ms: number };

function time<T>(label: string, run: () => T, into: Timing[]): T {
  const started = process.hrtime.bigint();
  const value = run();
  into.push({ label, ms: Number(process.hrtime.bigint() - started) / 1e6 });
  return value;
}

/**
 * Play the opening of a game and report what it cost. Returns null if the engine could not be
 * exercised at all, so a caller can log a clear failure instead of crashing the server.
 */
export function probeEngine(decks: [unknown, unknown]): { timings: Timing[]; stateBytes: number; viewBytes: number } | null {
  try {
    const timings: Timing[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deck shape is the engine's own
    const game: any = time("createGame", () => createGame(decks as never, ["A", "B"], 1234, 0), timings);
    for (const seat of [0, 1] as const) {
      time(`keepHand p${seat}`, () => applyAction(game, seat, { t: "keepHand" } as never), timings);
    }
    const view = time("viewFor", () => viewFor(game, 0), timings);
    return {
      timings,
      stateBytes: JSON.stringify(game).length,
      viewBytes: JSON.stringify(view).length,
    };
  } catch (error) {
    console.error("[engine-probe] the vendored engine could not be run:", error);
    return null;
  }
}
