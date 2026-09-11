const timed = new Set(["Wildfire", "Thunderstorm", "Entangle Terrain"]);
type State = Record<string, unknown>;
const record = (value: unknown): value is State => !!value && typeof value === "object" && !Array.isArray(value);

/** Route CPU turn changes through End before clearing damage or temporary effects. */
export function cpuEndPhasePatch(game: State, patch: State, humanSender: boolean): State {
  if (!patch.currentPlayer || patch.currentPlayer === game.currentPlayer) return patch;
  const key = `${game.turn}:${game.currentPlayer}`;
  if (game.phase === "End" && humanSender && patch.cpuEndResolved === key) return {...patch,cpuEndPending:false,cpuEndResolved:null};
  if (game.cpuEndPending) {
    if (humanSender && patch.cpuEndResolved === key) return {...patch,cpuEndPending:false,cpuEndResolved:null};
    return {}; // Includes delayed bot pass retries while the human resolves triggers.
  }
  const permanents = record(game.permanents) ? game.permanents : {};
  const hasTimed = Object.values(permanents).some(items => Array.isArray(items) && items.some(item =>
    record(item) && record(item.card) && timed.has(String(item.card.name))));
  if (!hasTimed) return patch;
  return {phase:"End",cpuEndPending:true};
}
