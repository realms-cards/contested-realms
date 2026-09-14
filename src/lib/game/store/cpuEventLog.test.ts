import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createGameStore } from "@/lib/game/store";
import type { GameState } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";
import type { CustomMessage } from "@/lib/net/transport";

/** The human client (p1) during the opponent's turn. */
function setup(opponentPlayerId: string, overrides: Partial<GameState> = {}) {
  const store = createGameStore();
  const trySendPatch = vi.fn();
  store.setState({opponentPlayerId,actorKey:"p1",currentPlayer:2,turn:4,transport:new LocalTransport(),trySendPatch,...overrides} as Partial<GameState>);
  return {store,trySendPatch};
}
const texts = (store: ReturnType<typeof setup>["store"]) => store.getState().events.map(event => event.text);

beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

describe("event log in CPU matches", () => {
  it("records the human client's lines on the CPU's turn and sends them", () => {
    const {store,trySendPatch} = setup("cpu_bot");
    store.getState().log("Arid Desert: Deal 1 to every minion atop Tile #8");
    expect(texts(store)).toEqual(["Arid Desert: Deal 1 to every minion atop Tile #8"]);
    expect(store.getState().events[0]).toMatchObject({player:2,turn:4});
    expect(trySendPatch).toHaveBeenCalledWith({events:store.getState().events,eventSeq:1});
  });

  it("still leaves the opponent's turn to the opponent's client in a match between people", () => {
    const {store,trySendPatch} = setup("user_2");
    store.getState().log("[p2:PLAYER] plays [p2card:Arid Desert] at #13");
    expect(texts(store)).toEqual([]);
    expect(trySendPatch).not.toHaveBeenCalled();
  });

  it("records the bot's own line from botActionToast, only for a seated player in a CPU match", () => {
    const line = "[p2:PLAYER] plays [p2card:Arid Desert] at Tile #13";
    const message = {type:"botActionToast",message:null,log:line,playerKey:"p2",ts:1} as unknown as CustomMessage;
    const cpu = setup("cpu_bot");
    cpu.store.getState().receiveCustomMessage(message);
    expect(texts(cpu.store)).toEqual([line]);
    const spectator = setup("cpu_bot",{actorKey:null});
    spectator.store.getState().receiveCustomMessage(message);
    expect(texts(spectator.store)).toEqual([]);
    const people = setup("user_2");
    people.store.getState().receiveCustomMessage(message);
    expect(texts(people.store)).toEqual([]);
  });
});
